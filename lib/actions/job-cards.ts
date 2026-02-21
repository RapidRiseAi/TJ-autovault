'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { JOB_CARD_STATUSES, MAJOR_JOB_TIMELINE_STATUSES, type JobCardStatus } from '@/lib/job-cards';

type Result = { ok: true; jobId?: string; message?: string } | { ok: false; error: string };

async function getWorkshopContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase.from('profiles').select('id,role,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id || !['admin', 'technician'].includes(profile.role)) return null;
  return { supabase, profile };
}

async function appendVehicleTimeline(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  workshopId: string;
  vehicleId: string;
  actorId: string;
  title: string;
  eventType: string;
  customerAccountId: string | null;
  metadata?: Record<string, unknown>;
}) {
  await args.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: args.workshopId,
    customer_account_id: args.customerAccountId,
    vehicle_id: args.vehicleId,
    actor_profile_id: args.actorId,
    actor_role: 'admin',
    event_type: args.eventType,
    title: args.title,
    metadata: args.metadata ?? {}
  });
}

export async function startJobCard(input: { vehicleId: string; title: string; quoteId?: string; beforePhotoPaths: string[]; technicianIds: string[] }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const beforePhotoPaths = input.beforePhotoPaths.map((path) => path.trim()).filter(Boolean);
  if (!beforePhotoPaths.length) return { ok: false, error: 'At least one before photo is required.' };

  const { data: vehicle } = await ctx.supabase.from('vehicles').select('id,current_customer_account_id').eq('id', input.vehicleId).eq('workshop_account_id', ctx.profile.workshop_account_id).maybeSingle();
  if (!vehicle) return { ok: false, error: 'Vehicle not found.' };

  const { data: existing } = await ctx.supabase.from('job_cards').select('id').eq('vehicle_id', vehicle.id).in('status', ['not_started', 'in_progress', 'waiting_parts', 'waiting_approval', 'quality_check', 'ready']).maybeSingle();
  if (existing) return { ok: false, error: 'An active job already exists for this vehicle.' };

  const now = new Date().toISOString();
  const { data: job, error } = await ctx.supabase.from('job_cards').insert({
    vehicle_id: vehicle.id,
    workshop_id: ctx.profile.workshop_account_id,
    created_by: ctx.profile.id,
    title: input.title.trim() || 'Service job',
    status: 'in_progress',
    started_at: now,
    last_updated_at: now
  }).select('id').single();
  if (error || !job) return { ok: false, error: error?.message ?? 'Could not start job.' };

  await ctx.supabase.from('job_card_photos').insert(
    beforePhotoPaths.map((path) => ({ job_card_id: job.id, kind: 'before', storage_path: path, uploaded_by: ctx.profile.id }))
  );

  if (input.technicianIds.length) {
    await ctx.supabase.from('job_card_assignments').insert(
      input.technicianIds.map((id) => ({ job_card_id: job.id, technician_user_id: id }))
    );
  }

  await ctx.supabase.from('job_card_events').insert({
    job_card_id: job.id,
    event_type: 'job_started',
    payload: { title: input.title, quoteId: input.quoteId ?? null },
    created_by: ctx.profile.id
  });

  await appendVehicleTimeline({
    supabase: ctx.supabase,
    workshopId: ctx.profile.workshop_account_id,
    vehicleId: vehicle.id,
    actorId: ctx.profile.id,
    customerAccountId: vehicle.current_customer_account_id,
    eventType: 'job_started',
    title: `Job started: ${input.title}`,
    metadata: { job_card_id: job.id }
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/workshop/jobs/${job.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, jobId: job.id };
}

export async function updateJobCardStatus(input: { jobId: string; status: JobCardStatus }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!JOB_CARD_STATUSES.includes(input.status)) return { ok: false, error: 'Invalid status' };

  const { data: job } = await ctx.supabase.from('job_cards').select('id,vehicle_id,workshop_id,is_locked,status,vehicles(current_customer_account_id)').eq('id', input.jobId).eq('workshop_id', ctx.profile.workshop_account_id).maybeSingle();
  if (!job) return { ok: false, error: 'Job not found' };
  if (job.is_locked) return { ok: false, error: 'Job is closed and locked.' };

  await ctx.supabase.from('job_cards').update({ status: input.status, last_updated_at: new Date().toISOString() }).eq('id', input.jobId);
  await ctx.supabase.from('job_card_events').insert({ job_card_id: input.jobId, event_type: 'status_changed', payload: { status: input.status }, created_by: ctx.profile.id });

  if (MAJOR_JOB_TIMELINE_STATUSES.has(input.status)) {
    await appendVehicleTimeline({
      supabase: ctx.supabase,
      workshopId: ctx.profile.workshop_account_id,
      vehicleId: job.vehicle_id,
      actorId: ctx.profile.id,
      customerAccountId: ((job.vehicles as Array<{ current_customer_account_id: string | null }> | null)?.[0]?.current_customer_account_id ?? null),
      eventType: 'job_status_waiting',
      title: `Job waiting: ${input.status.replaceAll('_', ' ')}`,
      metadata: { job_card_id: input.jobId, status: input.status }
    });
  }

  revalidatePath(`/workshop/jobs/${input.jobId}`);
  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  revalidatePath(`/customer/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function addJobCardEvent(input: { jobId: string; eventType: string; note: string; customerFacing?: boolean }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: job } = await ctx.supabase.from('job_cards').select('id,vehicle_id,is_locked').eq('id', input.jobId).eq('workshop_id', ctx.profile.workshop_account_id).maybeSingle();
  if (!job) return { ok: false, error: 'Job not found' };
  if (job.is_locked) return { ok: false, error: 'Job is closed and locked.' };

  await ctx.supabase.from('job_card_events').insert({
    job_card_id: input.jobId,
    event_type: input.eventType,
    payload: { note: input.note },
    created_by: ctx.profile.id
  });

  if (input.customerFacing) {
    await ctx.supabase.from('job_card_updates').insert({
      job_card_id: input.jobId,
      message: input.note,
      created_by: ctx.profile.id
    });
  }

  await ctx.supabase.from('job_cards').update({ last_updated_at: new Date().toISOString() }).eq('id', input.jobId);
  revalidatePath(`/workshop/jobs/${input.jobId}`);
  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  revalidatePath(`/customer/jobs/${input.jobId}`);
  revalidatePath(`/customer/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function completeJobCard(input: { jobId: string; endNote: string; afterPhotoPaths: string[] }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!input.endNote.trim()) return { ok: false, error: 'End note is required' };
  const afterPhotoPaths = input.afterPhotoPaths.map((path) => path.trim()).filter(Boolean);
  if (!afterPhotoPaths.length) return { ok: false, error: 'At least one after photo is required' };

  const { data: job } = await ctx.supabase.from('job_cards').select('id,vehicle_id,is_locked,vehicles(current_customer_account_id)').eq('id', input.jobId).eq('workshop_id', ctx.profile.workshop_account_id).maybeSingle();
  if (!job) return { ok: false, error: 'Job not found' };
  if (job.is_locked) return { ok: false, error: 'Job is closed and locked.' };

  await ctx.supabase.from('job_card_photos').insert(
    afterPhotoPaths.map((path) => ({ job_card_id: input.jobId, kind: 'after', storage_path: path, uploaded_by: ctx.profile.id }))
  );

  const now = new Date().toISOString();
  await ctx.supabase.from('job_cards').update({ status: 'completed', completed_at: now, last_updated_at: now, customer_summary: input.endNote }).eq('id', input.jobId);
  await ctx.supabase.from('job_card_events').insert({ job_card_id: input.jobId, event_type: 'job_completed', payload: { note: input.endNote }, created_by: ctx.profile.id });
  await ctx.supabase.from('job_card_updates').insert({ job_card_id: input.jobId, message: 'Work completed, final checks in progress.', auto_generated: true, created_by: ctx.profile.id });

  await appendVehicleTimeline({
    supabase: ctx.supabase,
    workshopId: ctx.profile.workshop_account_id,
    vehicleId: job.vehicle_id,
    actorId: ctx.profile.id,
    customerAccountId: ((job.vehicles as Array<{ current_customer_account_id: string | null }> | null)?.[0]?.current_customer_account_id ?? null),
    eventType: 'job_completed',
    title: 'Job completed',
    metadata: { job_card_id: input.jobId }
  });

  revalidatePath(`/workshop/jobs/${input.jobId}`);
  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  revalidatePath(`/customer/jobs/${input.jobId}`);
  revalidatePath(`/customer/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function closeJobCard(input: { jobId: string; summary?: string }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (ctx.profile.role !== 'admin') return { ok: false, error: 'Manager/admin access required' };

  const { data: job } = await ctx.supabase.from('job_cards').select('id,vehicle_id,is_locked,vehicles(current_customer_account_id)').eq('id', input.jobId).eq('workshop_id', ctx.profile.workshop_account_id).maybeSingle();
  if (!job) return { ok: false, error: 'Job not found' };
  if (job.is_locked) return { ok: false, error: 'Job already closed' };

  const now = new Date().toISOString();
  await ctx.supabase.from('job_cards').update({
    status: 'closed',
    closed_at: now,
    is_locked: true,
    customer_summary: input.summary?.trim() || null,
    last_updated_at: now
  }).eq('id', input.jobId);
  await ctx.supabase.from('job_card_events').insert({ job_card_id: input.jobId, event_type: 'job_closed', payload: { summary: input.summary }, created_by: ctx.profile.id });

  await appendVehicleTimeline({
    supabase: ctx.supabase,
    workshopId: ctx.profile.workshop_account_id,
    vehicleId: job.vehicle_id,
    actorId: ctx.profile.id,
    customerAccountId: ((job.vehicles as Array<{ current_customer_account_id: string | null }> | null)?.[0]?.current_customer_account_id ?? null),
    eventType: 'job_closed',
    title: 'Job card closed',
    metadata: { job_card_id: input.jobId }
  });

  revalidatePath(`/workshop/jobs/${input.jobId}`);
  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  revalidatePath(`/customer/jobs/${input.jobId}`);
  revalidatePath(`/customer/vehicles/${job.vehicle_id}`);
  return { ok: true };
}
