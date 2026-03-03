'use server';

import { revalidatePath } from 'next/cache';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerDashboard, customerVehicle } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { addVehicleSchema } from '@/lib/validation/vehicle';
import { z } from 'zod';

type ActionResult =
  | { ok: true; vehicleId?: string; message?: string }
  | { ok: false; error: string };

export async function createCustomerAccountIfMissing(): Promise<ActionResult> {
  try {
    const context = await getCustomerContextOrCreate({ allowAutoCreate: true });
    if (!context) return { ok: false, error: 'Please sign in first.' };
    revalidatePath(customerDashboard());
    return { ok: true, message: 'Profile linked.' };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : 'Could not create customer profile'
    };
  }
}

export async function createCustomerVehicle(
  input: unknown
): Promise<ActionResult> {
  const parsed = addVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data'
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  try {
    const context = await getCustomerContextOrCreate();
    if (!context) return { ok: false, error: 'Please sign in first.' };
    const account = context.customer_account;

    const [{ count }, { data: customer }] = await Promise.all([
      supabase
        .from('vehicles')
        .select('id', { count: 'exact', head: true })
        .eq('current_customer_account_id', account.id),
      supabase
        .from('customer_accounts')
        .select('vehicle_limit')
        .eq('id', account.id)
        .single()
    ]);

    if ((count ?? 0) >= (customer?.vehicle_limit ?? 1)) {
      return { ok: false, error: 'Upgrade plan to add more vehicles' };
    }

    const { data: vehicleId, error } = await supabase.rpc(
      'create_customer_vehicle',
      {
        p_registration_number: payload.registrationNumber,
        p_make: payload.make,
        p_model: payload.model,
        p_year: payload.year,
        p_vin: payload.vin || null,
        p_odometer_km: payload.currentMileage,
        p_notes: payload.notes || null
      }
    );

    if (error || !vehicleId) {
      return { ok: false, error: error?.message ?? 'Could not create vehicle' };
    }

    revalidatePath(customerDashboard());
    revalidatePath(customerVehicle(vehicleId));
    return { ok: true, vehicleId };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Could not create vehicle'
    };
  }
}

export async function createProblemReport(input: {
  vehicleId: string;
  category: 'vehicle' | 'noise' | 'engine' | 'brakes' | 'electrical' | 'other';
  description: string;
  subject?: string;
  attachment?: {
    bucket: 'vehicle-files';
    path: string;
    fileName?: string;
  };
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };
  const account = context.customer_account;

  const { error } = await supabase.from('problem_reports').insert({
    workshop_account_id: account.workshop_account_id,
    customer_account_id: account.id,
    vehicle_id: input.vehicleId,
    category: input.category,
    description: input.description,
    subject: input.subject?.trim() || null,
    attachment_bucket: input.attachment?.bucket ?? null,
    attachment_path: input.attachment?.path ?? null,
    attachment_name: input.attachment?.fileName ?? null
  });

  if (error)
    return {
      ok: false,
      error: 'Could not submit your report right now. Please try again.'
    };
  revalidatePath(customerVehicle(input.vehicleId));
  return { ok: true, message: 'Problem reported successfully.' };
}

export async function createWorkRequest(input: {
  vehicleId: string;
  requestType:
    | 'inspection'
    | 'service'
    | 'quote'
    | 'diagnostic'
    | 'repair'
    | 'parts'
    | 'other';
  subject?: string;
  body?: string;
  preferredDate?: string;
  notes?: string;
  attachment?: {
    bucket: 'vehicle-files';
    path: string;
    fileName?: string;
  };
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };
  const account = context.customer_account;

  const { error } = await supabase.from('work_requests').insert({
    workshop_account_id: account.workshop_account_id,
    vehicle_id: input.vehicleId,
    customer_account_id: account.id,
    request_type: input.requestType,
    preferred_date: input.preferredDate || null,
    notes: input.notes || input.body || null,
    subject: input.subject?.trim() || null,
    body: input.body?.trim() || null,
    attachment_bucket: input.attachment?.bucket ?? null,
    attachment_path: input.attachment?.path ?? null,
    attachment_name: input.attachment?.fileName ?? null
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(customerVehicle(input.vehicleId));
  revalidatePath('/workshop/dashboard');
  return { ok: true, message: 'Request submitted.' };
}

export async function decideJobCardApproval(input: {
  approvalId: string;
  decision: 'approved' | 'declined';
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };

  const account = context.customer_account;
  const { data: approval, error: fetchError } = await supabase
    .from('job_card_approvals')
    .select('id,status,title,job_card_id')
    .eq('id', input.approvalId)
    .maybeSingle();

  if (fetchError || !approval) {
    return { ok: false, error: fetchError?.message ?? 'Approval not found.' };
  }

  const { data: job } = await supabase
    .from('job_cards')
    .select('vehicle_id,workshop_id,vehicles(current_customer_account_id)')
    .eq('id', approval.job_card_id)
    .maybeSingle();
  if (!job) return { ok: false, error: 'Job card not found.' };

  const vehicleCustomerId = Array.isArray(job.vehicles)
    ? job.vehicles[0]?.current_customer_account_id ?? null
    : (job.vehicles as { current_customer_account_id?: string } | null)
        ?.current_customer_account_id ?? null;
  if (vehicleCustomerId !== account.id) {
    return { ok: false, error: 'You do not have access to this approval.' };
  }

  if ((approval.status ?? '').toLowerCase() !== 'pending') {
    return { ok: false, error: 'This approval request is already finalized.' };
  }

  const now = new Date().toISOString();
  const { error } = await supabase
    .from('job_card_approvals')
    .update({ status: input.decision, decided_at: now, decided_by: null })
    .eq('id', input.approvalId);
  if (error) return { ok: false, error: error.message };

  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: job.workshop_id,
    customer_account_id: account.id,
    vehicle_id: job.vehicle_id,
    actor_profile_id: (await supabase.auth.getUser()).data.user?.id ?? null,
    actor_role: 'customer',
    event_type: 'job_approval_decided',
    title: `Job approval ${input.decision}`,
    description: `${approval.title ?? 'Approval request'} ${input.decision}`,
    metadata: {
      approval_id: approval.id,
      job_card_id: approval.job_card_id,
      status: input.decision
    }
  });

  await supabase.rpc('push_notification_to_workshop', {
    p_workshop_account_id: job.workshop_id,
    p_kind: 'job',
    p_title: `Customer ${input.decision} job card approval`,
    p_body: approval.title ?? 'Approval decision submitted',
    p_href: `/workshop/jobs/${approval.job_card_id}`,
    p_data: {
      approval_id: approval.id,
      job_card_id: approval.job_card_id,
      status: input.decision
    }
  });

  revalidatePath(`/customer/jobs/${approval.job_card_id}`);
  revalidatePath(`/customer/vehicles/${job.vehicle_id}`);
  revalidatePath(`/customer/vehicles/${job.vehicle_id}/timeline`);
  revalidatePath(`/workshop/jobs/${approval.job_card_id}`);
  revalidatePath(`/workshop/vehicles/${job.vehicle_id}`);
  return { ok: true, message: `Approval ${input.decision}.` };
}

export async function updateMileage(input: {
  vehicleId: string;
  odometerKm: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };
  const account = context.customer_account;

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('odometer_km')
    .eq('id', input.vehicleId)
    .eq('current_customer_account_id', account.id)
    .maybeSingle();

  if (!vehicle) return { ok: false, error: 'Vehicle not found.' };

  const currentMileage = vehicle.odometer_km ?? 0;
  if (input.odometerKm < currentMileage) {
    return {
      ok: false,
      error: `Mileage must be at least ${currentMileage.toLocaleString()} km.`
    };
  }

  const { error } = await supabase
    .from('vehicles')
    .update({ odometer_km: input.odometerKm })
    .eq('id', input.vehicleId)
    .eq('current_customer_account_id', account.id);

  if (error) return { ok: false, error: error.message };

  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: account.workshop_account_id,
    customer_account_id: account.id,
    vehicle_id: input.vehicleId,
    actor_profile_id: (await supabase.auth.getUser()).data.user?.id,
    actor_role: 'customer',
    event_type: 'mileage_updated',
    title: 'Mileage updated',
    description: `Odometer updated to ${input.odometerKm} km`,
    metadata: { odometer_km: input.odometerKm }
  });

  revalidatePath(customerVehicle(input.vehicleId));
  return { ok: true, message: 'Mileage updated.' };
}

export async function decideQuote(input: {
  quoteId: string;
  decision: 'approved' | 'declined';
  reason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };
  const account = context.customer_account;

  const { data: currentQuote, error: currentQuoteError } = await supabase
    .from('quotes')
    .select('status,vehicle_id')
    .eq('id', input.quoteId)
    .eq('customer_account_id', account.id)
    .maybeSingle();

  if (currentQuoteError || !currentQuote) {
    return {
      ok: false,
      error: currentQuoteError?.message ?? 'Quote not found.'
    };
  }

  if (
    ['approved', 'declined'].includes((currentQuote.status ?? '').toLowerCase())
  ) {
    return {
      ok: false,
      error: 'Quote is already finalized and cannot be changed.'
    };
  }

  const { data, error } = await supabase
    .from('quotes')
    .update({
      status: input.decision,
      customer_decision_reason:
        input.decision === 'declined' ? (input.reason ?? null) : null,
      customer_decision_at: new Date().toISOString()
    })
    .eq('id', input.quoteId)
    .eq('customer_account_id', account.id)
    .select('vehicle_id')
    .maybeSingle();

  if (error || !data)
    return { ok: false, error: error?.message ?? 'Failed to update quote.' };
  revalidatePath(customerVehicle(data.vehicle_id));
  return { ok: true, message: `Quote ${input.decision}.` };
}

export async function decideRecommendation(input: {
  recommendationId: string;
  decision: 'approved' | 'declined';
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };
  const account = context.customer_account;

  const user = (await supabase.auth.getUser()).data.user;

  const { data, error } = await supabase
    .from('recommendations')
    .update({
      status: input.decision,
      status_text: 'done'
    })
    .eq('id', input.recommendationId)
    .eq('customer_account_id', account.id)
    .select('id,vehicle_id,title,workshop_account_id,customer_account_id')
    .single();

  if (error || !data)
    return {
      ok: false,
      error: error?.message ?? 'Failed to update recommendation.'
    };
  await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: data.workshop_account_id,
    customer_account_id: data.customer_account_id,
    vehicle_id: data.vehicle_id,
    actor_profile_id: user?.id ?? null,
    actor_role: 'customer',
    event_type: 'recommendation_status_changed',
    title: `Recommendation ${input.decision}`,
    description: `Customer ${input.decision} recommendation: ${data.title ?? 'Recommendation'}`,
    importance: input.decision === 'approved' ? 'info' : 'warning',
    metadata: {
      recommendation_id: data.id,
      status: input.decision,
      recommendation_title: data.title
    }
  });

  await supabase.rpc('push_notification_to_workshop', {
    p_workshop_account_id: data.workshop_account_id,
    p_kind: 'recommendation',
    p_title:
      input.decision === 'approved'
        ? 'Recommendation approved'
        : 'Recommendation declined',
    p_body: `Customer ${input.decision} recommendation: ${data.title ?? 'Recommendation'}`,
    p_href: `/workshop/vehicles/${data.vehicle_id}`,
    p_data: {
      recommendation_id: data.id,
      vehicle_id: data.vehicle_id,
      status: input.decision
    }
  });

  revalidatePath(`/workshop/vehicles/${data.vehicle_id}`);
  revalidatePath(`/workshop/vehicles/${data.vehicle_id}/timeline`);
  revalidatePath('/workshop/notifications');
  revalidatePath(customerVehicle(data.vehicle_id));
  revalidatePath(customerDashboard());
  return { ok: true, message: `Recommendation ${input.decision}.` };
}

export async function markNotificationRead(
  notificationId: string
): Promise<void> {
  const supabase = await createClient();
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId);
  revalidatePath('/notifications');
}

export async function updateCustomerVehicle(
  input: unknown
): Promise<ActionResult> {
  const parsed = addVehicleSchema
    .extend({ vehicleId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data'
    };
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in first.' };

  const updatePayload = {
    registration_number: payload.registrationNumber,
    make: payload.make,
    model: payload.model,
    year: payload.year,
    vin: payload.vin || null,
    odometer_km: payload.currentMileage,
    notes: payload.notes || null
  };

  let { data, error } = await supabase
    .from('vehicles')
    .update(updatePayload)
    .eq('id', payload.vehicleId)
    .eq('current_customer_account_id', context.customer_account.id)
    .select('id')
    .single();

  if (error?.code === 'PGRST204' && error.message.includes("'notes' column")) {
    ({ data, error } = await supabase
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
      .eq('current_customer_account_id', context.customer_account.id)
      .select('id')
      .single());
  }

  if (error || !data) {
    return { ok: false, error: error?.message ?? 'Could not update vehicle' };
  }

  revalidatePath(customerVehicle(payload.vehicleId));
  revalidatePath(customerDashboard());
  return { ok: true, vehicleId: payload.vehicleId };
}

export async function requestVehicleDeletion(input: {
  vehicleId: string;
  reason?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in first.' };

  const { data, error } = await supabase.rpc('request_vehicle_deletion', {
    p_vehicle_id: input.vehicleId,
    p_reason: input.reason ?? null
  });

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? 'Could not request vehicle deletion'
    };
  }

  revalidatePath(customerDashboard());
  revalidatePath(customerVehicle(input.vehicleId));
  return { ok: true, message: 'Vehicle removal requested.' };
}
