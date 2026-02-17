'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type Result = { ok: true; message?: string } | { ok: false; error: string };

async function getWorkshopContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('id,role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) return null;
  return { supabase, profile };
}

async function getVehicleContext(ctx: NonNullable<Awaited<ReturnType<typeof getWorkshopContext>>>, vehicleId: string) {
  return ctx.supabase.from('vehicles').select('id,workshop_account_id,current_customer_account_id').eq('id', vehicleId).eq('workshop_account_id', ctx.profile.workshop_account_id).single();
}

export async function createQuote(input: { vehicleId: string; totalCents: number; notes?: string }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId);
  if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };

  const { error } = await ctx.supabase.from('quotes').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    total_cents: input.totalCents,
    subtotal_cents: input.totalCents,
    notes: input.notes ?? null,
    status: 'sent'
  });
  if (error) return { ok: false, error: error.message };

  await ctx.supabase.from('vehicle_timeline_events').insert({ workshop_account_id: vehicle.workshop_account_id, customer_account_id: vehicle.current_customer_account_id, vehicle_id: vehicle.id, actor_profile_id: ctx.profile.id, actor_role: 'admin', event_type: 'quote_created', title: 'Quote created', description: input.notes ?? null, importance: 'info', metadata: {} });
  revalidatePath(`/workshop/vehicles/${vehicle.id}`); revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Quote created.' };
}

export async function createInvoice(input: { vehicleId: string; totalCents: number; dueDate?: string }): Promise<Result> {
  const ctx = await getWorkshopContext(); if (!ctx) return { ok: false, error: 'Unauthorized' };
  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId); if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };
  const { error } = await ctx.supabase.from('invoices').insert({ workshop_account_id: vehicle.workshop_account_id, customer_account_id: vehicle.current_customer_account_id, vehicle_id: vehicle.id, total_cents: input.totalCents, due_date: input.dueDate || null, status: 'sent', payment_status: 'unpaid' });
  if (error) return { ok: false, error: error.message };
  await ctx.supabase.from('vehicle_timeline_events').insert({ workshop_account_id: vehicle.workshop_account_id, customer_account_id: vehicle.current_customer_account_id, vehicle_id: vehicle.id, actor_profile_id: ctx.profile.id, actor_role: 'admin', event_type: 'invoice_created', title: 'Invoice issued', importance: 'warning', metadata: {} });
  revalidatePath(`/workshop/vehicles/${vehicle.id}`); revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Invoice created.' };
}

export async function updateInvoicePaymentStatus(input: { invoiceId: string; paymentStatus: 'unpaid' | 'partial' | 'paid' }): Promise<Result> {
  const ctx = await getWorkshopContext(); if (!ctx) return { ok: false, error: 'Unauthorized' };
  const { data, error } = await ctx.supabase.from('invoices').update({ payment_status: input.paymentStatus }).eq('id', input.invoiceId).eq('workshop_account_id', ctx.profile.workshop_account_id).select('vehicle_id,customer_account_id,workshop_account_id').single();
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not update invoice' };
  await ctx.supabase.from('vehicle_timeline_events').insert({ workshop_account_id: data.workshop_account_id, customer_account_id: data.customer_account_id, vehicle_id: data.vehicle_id, actor_profile_id: ctx.profile.id, actor_role: 'admin', event_type: 'payment_status_changed', title: `Payment ${input.paymentStatus}`, importance: input.paymentStatus === 'paid' ? 'info' : 'warning', metadata: {} });
  revalidatePath(`/workshop/vehicles/${data.vehicle_id}`); revalidatePath(`/customer/vehicles/${data.vehicle_id}`);
  return { ok: true };
}

export async function createRecommendation(input: { vehicleId: string; title: string; description?: string; severity: 'low' | 'medium' | 'high' }): Promise<Result> {
  const ctx = await getWorkshopContext(); if (!ctx) return { ok: false, error: 'Unauthorized' };
  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId); if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };
  const { error } = await ctx.supabase.from('recommendations').insert({ workshop_account_id: vehicle.workshop_account_id, customer_account_id: vehicle.current_customer_account_id, vehicle_id: vehicle.id, title: input.title, description: input.description ?? null, severity: input.severity, status: 'pending' });
  if (error) return { ok: false, error: error.message };
  await ctx.supabase.from('vehicle_timeline_events').insert({ workshop_account_id: vehicle.workshop_account_id, customer_account_id: vehicle.current_customer_account_id, vehicle_id: vehicle.id, actor_profile_id: ctx.profile.id, actor_role: 'admin', event_type: 'recommendation_added', title: input.title, description: input.description ?? null, importance: input.severity === 'high' ? 'urgent' : 'warning', metadata: {} });
  revalidatePath(`/workshop/vehicles/${vehicle.id}`); revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}

export async function updateServiceJobStatus(input: { jobId: string; status: 'open' | 'awaiting_approval' | 'in_progress' | 'completed' | 'cancelled' }): Promise<Result> {
  const ctx = await getWorkshopContext(); if (!ctx) return { ok: false, error: 'Unauthorized' };
  const { data: job, error } = await ctx.supabase.from('service_jobs').update({ status: input.status, updated_at: new Date().toISOString() }).eq('id', input.jobId).eq('workshop_account_id', ctx.profile.workshop_account_id).select('vehicle_id,customer_account_id,workshop_account_id').single();
  if (error || !job) return { ok: false, error: error?.message ?? 'Could not update job' };
  await ctx.supabase.from('vehicle_timeline_events').insert({ workshop_account_id: job.workshop_account_id, customer_account_id: job.customer_account_id, vehicle_id: job.vehicle_id, actor_profile_id: ctx.profile.id, actor_role: 'admin', event_type: 'job_status_changed', title: `Job status ${input.status}`, importance: input.status === 'cancelled' ? 'urgent' : 'info', metadata: {} });
  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function updateVehicleServiceReminders(input: { vehicleId: string; odometerKm?: number; nextServiceKm?: number; nextServiceDate?: string }): Promise<Result> {
  const ctx = await getWorkshopContext(); if (!ctx) return { ok: false, error: 'Unauthorized' };
  const patch = { odometer_km: input.odometerKm ?? null, next_service_km: input.nextServiceKm ?? null, next_service_date: input.nextServiceDate || null };
  const { data: vehicle, error } = await ctx.supabase.from('vehicles').update(patch).eq('id', input.vehicleId).eq('workshop_account_id', ctx.profile.workshop_account_id).select('id,current_customer_account_id,workshop_account_id').single();
  if (error || !vehicle?.current_customer_account_id) return { ok: false, error: error?.message ?? 'Vehicle not found' };
  await ctx.supabase.from('vehicle_timeline_events').insert({ workshop_account_id: vehicle.workshop_account_id, customer_account_id: vehicle.current_customer_account_id, vehicle_id: vehicle.id, actor_profile_id: ctx.profile.id, actor_role: 'admin', event_type: 'note', title: 'Service reminders updated', importance: 'info', metadata: patch });
  revalidatePath(`/workshop/vehicles/${vehicle.id}`); revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}
