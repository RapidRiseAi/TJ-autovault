'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { WORK_REQUEST_STATUSES, type WorkRequestStatus } from '@/lib/work-request-statuses';
import { addVehicleSchema } from '@/lib/validation/vehicle';
import { z } from 'zod';

type Result = { ok: true; message?: string; vehicleId?: string } | { ok: false; error: string };

function isMissingNotesColumnError(error: { code?: string; message?: string } | null) {
  if (!error) return false;

  const combined = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  const mentionsNotesColumn = combined.includes('notes') && combined.includes('column');
  const mentionsSchemaCache = combined.includes('schema cache') || combined.includes('postgrest');

  return (
    (error.code === 'PGRST204' && mentionsNotesColumn) ||
    (mentionsNotesColumn && mentionsSchemaCache) ||
    combined.includes("could not find the 'notes' column")
  );
}

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

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) return null;
  return { supabase, profile };
}

async function getVehicleContext(ctx: NonNullable<Awaited<ReturnType<typeof getWorkshopContext>>>, vehicleId: string) {
  return ctx.supabase
    .from('vehicles')
    .select('id,workshop_account_id,current_customer_account_id,registration_number')
    .eq('id', vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();
}

const workshopVehicleSchema = addVehicleSchema.extend({
  customerAccountId: z.string().uuid()
});

const workshopVehicleUpdateSchema = addVehicleSchema.extend({
  vehicleId: z.string().uuid()
});

export async function createWorkshopCustomerVehicle(input: unknown): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = workshopVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data' };
  }

  const payload = parsed.data;
  const { data: customer } = await ctx.supabase
    .from('customer_accounts')
    .select('id')
    .eq('id', payload.customerAccountId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!customer) return { ok: false, error: 'Customer account not found' };

  let { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .insert({
      workshop_account_id: ctx.profile.workshop_account_id,
      current_customer_account_id: payload.customerAccountId,
      registration_number: payload.registrationNumber,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      vin: payload.vin || null,
      odometer_km: payload.currentMileage,
      notes: payload.notes || null
    })
    .select('id,current_customer_account_id')
    .single();

  if (isMissingNotesColumnError(error)) {
    ({ data: vehicle, error } = await ctx.supabase
      .from('vehicles')
      .insert({
        workshop_account_id: ctx.profile.workshop_account_id,
        current_customer_account_id: payload.customerAccountId,
        registration_number: payload.registrationNumber,
        make: payload.make,
        model: payload.model,
        year: payload.year,
        vin: payload.vin || null,
        odometer_km: payload.currentMileage
      })
      .select('id,current_customer_account_id')
      .single());
  }

  if (error || !vehicle) {
    return { ok: false, error: error?.message ?? 'Could not create vehicle' };
  }

  if (!vehicle.current_customer_account_id) {
    const { data: linkedVehicle, error: linkError } = await ctx.supabase
      .from('vehicles')
      .update({ current_customer_account_id: payload.customerAccountId })
      .eq('id', vehicle.id)
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .select('id,current_customer_account_id')
      .maybeSingle();

    if (linkError) {
      return {
        ok: false,
        error: `Vehicle was created but could not be linked to customer account. Please retry linking from the vehicle page. (${linkError.message})`
      };
    }

    if (!linkedVehicle?.current_customer_account_id) {
      return {
        ok: false,
        error: 'Vehicle was created but is still not linked to this customer account. Please open the vehicle and link it manually.'
      };
    }
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/customers/${payload.customerAccountId}`);
  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath('/customer/dashboard');
  return { ok: true, message: 'Vehicle added.', vehicleId: vehicle.id };
}

export async function deleteWorkshopVehicle(input: { vehicleId: string; customerAccountId?: string }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = z.object({ vehicleId: z.string().uuid(), customerAccountId: z.string().uuid().optional() }).safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid vehicle id' };
  }

  const payload = parsed.data;
  const admin = createAdminClient();

  const { data: vehicle, error: vehicleError } = await admin
    .from('vehicles')
    .select('id,current_customer_account_id,workshop_account_id')
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (vehicleError || !vehicle) {
    return { ok: false, error: vehicleError?.message ?? 'Vehicle not found' };
  }

  const { error: deleteError } = await admin.from('vehicles').delete().eq('id', payload.vehicleId).eq('workshop_account_id', ctx.profile.workshop_account_id);
  if (deleteError) {
    return { ok: false, error: deleteError.message };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${payload.vehicleId}`);
  if (payload.customerAccountId) {
    revalidatePath(`/workshop/customers/${payload.customerAccountId}`);
  }
  if (vehicle.current_customer_account_id) {
    revalidatePath(`/customer/vehicles/${payload.vehicleId}`);
  }
  revalidatePath('/customer/dashboard');

  return { ok: true, message: 'Vehicle deleted.' };
}

export async function updateWorkshopVehicleInfo(input: unknown): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const parsed = workshopVehicleUpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data' };
  }

  const payload = parsed.data;

  let { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update({
      registration_number: payload.registrationNumber,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      vin: payload.vin || null,
      odometer_km: payload.currentMileage,
      notes: payload.notes || null
    })
    .eq('id', payload.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,current_customer_account_id')
    .maybeSingle();

  if (isMissingNotesColumnError(error)) {
    ({ data: vehicle, error } = await ctx.supabase
      .from('vehicles')
      .update({
        registration_number: payload.registrationNumber,
        make: payload.make,
        model: payload.model,
        year: payload.year,
        vin: payload.vin || null,
        odometer_km: payload.currentMileage
      })
      .eq('id', payload.vehicleId)
      .eq('workshop_account_id', ctx.profile.workshop_account_id)
      .select('id,current_customer_account_id')
      .maybeSingle());
  }

  if (error || !vehicle) {
    return { ok: false, error: error?.message ?? 'Could not update vehicle' };
  }

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${payload.vehicleId}`);
  revalidatePath(`/customer/vehicles/${payload.vehicleId}`);
  if (vehicle.current_customer_account_id) {
    revalidatePath(`/workshop/customers/${vehicle.current_customer_account_id}`);
  }
  return { ok: true, message: 'Vehicle updated.' };
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

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'quote_created',
    title: 'Quote created',
    description: input.notes ?? null,
    importance: 'info',
    metadata: {}
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Quote created.' };
}

export async function createInvoice(input: { vehicleId: string; totalCents: number; subject?: string; notes?: string; dueDate?: string }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId);
  if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };

  const { data: invoice, error } = await ctx.supabase
    .from('invoices')
    .insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: vehicle.id,
      total_cents: input.totalCents,
      due_date: input.dueDate || null,
      status: 'sent',
      payment_status: 'unpaid',
      subject: input.subject || null,
      notes: input.notes || null
    })
    .select('id')
    .single();
  if (error || !invoice) return { ok: false, error: error?.message ?? 'Unable to create invoice' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'invoice_created',
    title: input.subject?.trim() || 'Invoice issued',
    description: input.notes || null,
    importance: 'warning',
    metadata: { invoice_id: invoice.id }
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Invoice created.' };
}

export async function updateInvoicePaymentStatus(input: { invoiceId: string; paymentStatus: 'unpaid' | 'partial' | 'paid' }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data, error } = await ctx.supabase
    .from('invoices')
    .update({ payment_status: input.paymentStatus })
    .eq('id', input.invoiceId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('vehicle_id,customer_account_id,workshop_account_id')
    .maybeSingle();

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not update invoice' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: data.workshop_account_id,
    customer_account_id: data.customer_account_id,
    vehicle_id: data.vehicle_id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'payment_status_changed',
    title: `Payment ${input.paymentStatus}`,
    importance: input.paymentStatus === 'paid' ? 'info' : 'warning',
    metadata: { invoice_id: input.invoiceId }
  });

  revalidatePath(`/workshop/vehicles/${data.vehicle_id}`);
  revalidatePath(`/customer/vehicles/${data.vehicle_id}`);
  return { ok: true };
}

export async function createRecommendation(input: { vehicleId: string; title: string; description?: string; severity: 'low' | 'medium' | 'high' }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle } = await getVehicleContext(ctx, input.vehicleId);
  if (!vehicle?.current_customer_account_id) return { ok: false, error: 'Vehicle not found' };

  const { error } = await ctx.supabase.from('recommendations').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    title: input.title,
    description: input.description ?? null,
    severity: input.severity,
    status: 'open'
  });
  if (error) return { ok: false, error: error.message };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'recommendation_added',
    title: input.title,
    description: input.description ?? null,
    importance: input.severity === 'high' ? 'urgent' : 'warning',
    metadata: {}
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}

export async function updateServiceJobStatus(input: {
  jobId: string;
  status: 'open' | 'awaiting_approval' | 'in_progress' | 'completed' | 'cancelled';
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: job, error } = await ctx.supabase
    .from('service_jobs')
    .update({ status: input.status, updated_at: new Date().toISOString() })
    .eq('id', input.jobId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('vehicle_id,customer_account_id,workshop_account_id')
    .maybeSingle();

  if (error || !job) return { ok: false, error: error?.message ?? 'Could not update job' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: job.workshop_account_id,
    customer_account_id: job.customer_account_id,
    vehicle_id: job.vehicle_id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'job_status_changed',
    title: `Job status ${input.status}`,
    importance: input.status === 'cancelled' ? 'urgent' : 'info',
    metadata: {}
  });

  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  return { ok: true };
}

export async function updateWorkRequestStatus(input: { workRequestId: string; status: WorkRequestStatus }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };
  if (!WORK_REQUEST_STATUSES.includes(input.status)) return { ok: false, error: 'Invalid status.' };

  const { data: request, error } = await ctx.supabase
    .from('work_requests')
    .update({ status: input.status })
    .eq('id', input.workRequestId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,vehicle_id,customer_account_id,workshop_account_id,request_type,status')
    .maybeSingle();

  if (error || !request) return { ok: false, error: error?.message ?? 'Could not update work request status' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: request.workshop_account_id,
    customer_account_id: request.customer_account_id,
    vehicle_id: request.vehicle_id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'job_status_changed',
    title: `Work request ${request.request_type} status: ${request.status}`,
    importance: request.status === 'cancelled' ? 'urgent' : request.status === 'delivered' ? 'info' : 'warning',
    metadata: { work_request_id: request.id, request_type: request.request_type, status: request.status }
  });

  await ctx.supabase.rpc('push_notification', {
    p_workshop_account_id: request.workshop_account_id,
    p_to_customer_account_id: request.customer_account_id,
    p_kind: 'request',
    p_title: 'Work request update',
    p_body: `Your ${request.request_type} request is now ${request.status.replaceAll('_', ' ')}.`,
    p_href: `/customer/vehicles/${request.vehicle_id}`,
    p_data: { work_request_id: request.id, status: request.status, request_type: request.request_type }
  });

  revalidatePath(`/workshop/work-requests`);
  revalidatePath(`/workshop/work-requests/${request.id}`);
  revalidatePath(`/workshop/vehicles/${request.vehicle_id}`);
  revalidatePath(`/customer/vehicles/${request.vehicle_id}`);
  return { ok: true, message: 'Work request status updated.' };
}

export async function updateVehicleServiceReminders(input: {
  vehicleId: string;
  odometerKm?: number;
  nextServiceKm?: number;
  nextServiceDate?: string;
}): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: currentVehicle } = await ctx.supabase
    .from('vehicles')
    .select('odometer_km')
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .maybeSingle();

  if (!currentVehicle) return { ok: false, error: 'Vehicle not found' };

  const currentMileage = currentVehicle.odometer_km ?? 0;
  if (typeof input.odometerKm === 'number' && input.odometerKm < currentMileage) {
    return {
      ok: false,
      error: `Mileage must be at least ${currentMileage.toLocaleString()} km.`
    };
  }

  const patch = {
    odometer_km: input.odometerKm ?? currentMileage,
    next_service_km: input.nextServiceKm ?? null,
    next_service_date: input.nextServiceDate || null
  };

  const { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update(patch)
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,current_customer_account_id,workshop_account_id')
    .maybeSingle();

  if (error || !vehicle?.current_customer_account_id) return { ok: false, error: error?.message ?? 'Vehicle not found' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'note',
    title: 'Service reminders updated',
    importance: 'info',
    metadata: patch
  });

  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true };
}

export async function verifyVehicle(input: { vehicleId: string }): Promise<Result> {
  const ctx = await getWorkshopContext();
  if (!ctx) return { ok: false, error: 'Unauthorized' };

  const { data: vehicle, error } = await ctx.supabase
    .from('vehicles')
    .update({ status: 'verified' })
    .eq('id', input.vehicleId)
    .eq('workshop_account_id', ctx.profile.workshop_account_id)
    .select('id,current_customer_account_id,workshop_account_id,registration_number')
    .maybeSingle();

  if (error || !vehicle?.current_customer_account_id) return { ok: false, error: error?.message ?? 'Vehicle not found' };

  await ctx.supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: ctx.profile.id,
    actor_role: 'admin',
    event_type: 'note',
    title: 'Vehicle verified',
    importance: 'info',
    metadata: { status: 'verified' }
  });

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/customers');
  revalidatePath(`/workshop/vehicles/${vehicle.id}`);
  revalidatePath(`/customer/vehicles/${vehicle.id}`);
  return { ok: true, message: 'Vehicle verified' };
}
