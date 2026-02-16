'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function getWorkshopContext() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return null;
  }

  return { supabase, profile };
}

export async function verifyVehicle(input: { vehicleId: string; status: 'verified' | 'flagged' }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update({ status: input.status })
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,current_customer_account_id')
    .single();

  if (error || !vehicle?.current_customer_account_id) return { ok: false, error: error?.message ?? 'Vehicle not found' };

  await ctx.supabase.rpc('add_vehicle_timeline_event', {
    p_workshop_account_id: ctx.profile.workshop_account_id,
    p_customer_account_id: vehicle.current_customer_account_id,
    p_vehicle_id: vehicle.id,
    p_event_type: 'status_changed',
    p_title: `Vehicle ${input.status}`,
    p_meta: { status: input.status }
  });

  revalidatePath('/workshop/dashboard');
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}

export async function createServiceJob(input: { vehicleId: string; complaint?: string; odometerKm?: number }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await ctx.supabase
    .from('vehicles')
    .select('id,current_customer_account_id')
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .single();
  if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };

  const { data: job, error } = await ctx.supabase.from('service_jobs').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: input.vehicleId,
    complaint: input.complaint ?? null,
    odometer_km: input.odometerKm ?? null
  }).select('id').single();

  if (error || !job) return { ok: false, error: error?.message ?? 'Could not create job' };

  await ctx.supabase.rpc('add_vehicle_timeline_event', {
    p_workshop_account_id: ctx.profile.workshop_account_id,
    p_customer_account_id: vehicle.current_customer_account_id,
    p_vehicle_id: input.vehicleId,
    p_event_type: 'job_created',
    p_title: 'Service job opened',
    p_meta: { job_id: job.id }
  });
  revalidatePath('/workshop/dashboard');
  return { ok: true };
}

export async function updateServiceJobStatus(input: { jobId: string; status: 'open' | 'awaiting_approval' | 'in_progress' | 'completed' | 'cancelled' }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const update: Record<string, unknown> = { status: input.status };
  if (input.status === 'completed' || input.status === 'cancelled') update.closed_at = new Date().toISOString();

  const { data: job, error } = await ctx.supabase
    .from('service_jobs')
    .update(update)
    .eq('id', input.jobId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('vehicle_id,customer_account_id')
    .single();

  if (error || !job) return { ok: false, error: error?.message ?? 'Could not update job' };

  await ctx.supabase.rpc('add_vehicle_timeline_event', {
    p_workshop_account_id: ctx.profile.workshop_account_id,
    p_customer_account_id: job.customer_account_id,
    p_vehicle_id: job.vehicle_id,
    p_event_type: 'job_status_changed',
    p_title: `Service job status: ${input.status}`,
    p_meta: { job_id: input.jobId, status: input.status }
  });

  revalidatePath('/workshop/dashboard');
  revalidatePath(`/customer/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function createRecommendation(input: { vehicleId: string; serviceJobId?: string; title: string; description?: string; priority: 'low'|'normal'|'high'|'urgent' }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await ctx.supabase.from('vehicles').select('current_customer_account_id').eq('id', input.vehicleId).eq('workshop_account_id', ctx.profile.workshop_account_id).single();
  if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };

  const { data: rec, error } = await ctx.supabase.from('service_recommendations').insert({
    workshop_account_id: ctx.profile.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: input.vehicleId,
    service_job_id: input.serviceJobId ?? null,
    title: input.title,
    description: input.description ?? null,
    priority: input.priority
  }).select('id').single();

  if (error || !rec) return { ok: false, error: error?.message ?? 'Could not create recommendation' };

  await ctx.supabase.rpc('add_vehicle_timeline_event', {
    p_workshop_account_id: ctx.profile.workshop_account_id,
    p_customer_account_id: vehicle.current_customer_account_id,
    p_vehicle_id: input.vehicleId,
    p_event_type: 'recommendation_added',
    p_title: input.title,
    p_body: input.description ?? null,
    p_meta: { recommendation_id: rec.id }
  });

  return { ok: true };
}

export async function updateTicketStatus(input: { ticketId: string; status: 'open' | 'in_progress' | 'resolved' }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { error } = await ctx.supabase
    .from('support_tickets')
    .update({ status: input.status })
    .eq('id', input.ticketId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/workshop/dashboard');
  return { ok: true };
}
