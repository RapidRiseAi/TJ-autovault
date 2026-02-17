'use server';

import { revalidatePath } from 'next/cache';
import { ensureCustomerAccountLinked } from '@/lib/customer/ensureCustomerAccountLinked';
import { customerDashboard, customerVehicle } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { addVehicleSchema } from '@/lib/validation/vehicle';

type ActionResult = { ok: true; vehicleId?: string; message?: string } | { ok: false; error: string };

export async function createCustomerAccountIfMissing(): Promise<ActionResult> {
  try {
    const account = await ensureCustomerAccountLinked();
    if (!account) return { ok: false, error: 'Please sign in first.' };
    revalidatePath(customerDashboard());
    return { ok: true, message: 'Profile linked.' };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not create customer profile' };
  }
}

export async function createCustomerVehicle(input: unknown): Promise<ActionResult> {
  const parsed = addVehicleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid vehicle data' };
  }

  const payload = parsed.data;
  const supabase = await createClient();

  try {
    const account = await ensureCustomerAccountLinked();
    if (!account) return { ok: false, error: 'Please sign in first.' };

    const [{ count }, { data: customer }] = await Promise.all([
      supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('current_customer_account_id', account.id),
      supabase.from('customer_accounts').select('vehicle_limit').eq('id', account.id).single()
    ]);

    if ((count ?? 0) >= (customer?.vehicle_limit ?? 1)) {
      return { ok: false, error: 'Upgrade plan to add more vehicles' };
    }

    const { data: vehicleId, error } = await supabase.rpc('create_customer_vehicle', {
      p_registration_number: payload.registrationNumber,
      p_make: payload.make,
      p_model: payload.model,
      p_year: payload.year,
      p_vin: payload.vin || null,
      p_odometer_km: payload.currentMileage,
      p_notes: payload.notes || null
    });

    if (error || !vehicleId) {
      return { ok: false, error: error?.message ?? 'Could not create vehicle' };
    }

    revalidatePath(customerDashboard());
    revalidatePath(customerVehicle(vehicleId));
    return { ok: true, vehicleId };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'Could not create vehicle' };
  }
}

export async function createProblemReport(input: {
  vehicleId: string;
  category: 'vehicle' | 'noise' | 'engine' | 'brakes' | 'electrical' | 'other';
  description: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const account = await ensureCustomerAccountLinked();
  if (!account) return { ok: false, error: 'Please sign in.' };

  const { error } = await supabase.from('problem_reports').insert({
    workshop_account_id: account.workshop_account_id,
    customer_account_id: account.id,
    vehicle_id: input.vehicleId,
    category: input.category,
    description: input.description
  });

  if (error) return { ok: false, error: 'Could not submit your report right now. Please try again.' };
  revalidatePath(customerVehicle(input.vehicleId));
  return { ok: true, message: 'Problem reported successfully.' };
}

export async function createWorkRequest(input: {
  vehicleId: string;
  requestType: 'inspection' | 'service';
  preferredDate?: string;
  notes?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const account = await ensureCustomerAccountLinked();
  if (!account) return { ok: false, error: 'Please sign in.' };

  const { error } = await supabase.from('work_requests').insert({
    workshop_account_id: account.workshop_account_id,
    vehicle_id: input.vehicleId,
    customer_account_id: account.id,
    request_type: input.requestType,
    preferred_date: input.preferredDate || null,
    notes: input.notes || null
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath(customerVehicle(input.vehicleId));
  revalidatePath('/workshop/dashboard');
  return { ok: true, message: 'Request submitted.' };
}

export async function updateMileage(input: { vehicleId: string; odometerKm: number }): Promise<ActionResult> {
  const supabase = await createClient();
  const account = await ensureCustomerAccountLinked();
  if (!account) return { ok: false, error: 'Please sign in.' };

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

export async function decideQuote(input: { quoteId: string; decision: 'approved' | 'declined' }): Promise<ActionResult> {
  const supabase = await createClient();
  const account = await ensureCustomerAccountLinked();
  if (!account) return { ok: false, error: 'Please sign in.' };

  const { data, error } = await supabase
    .from('quotes')
    .update({ status: input.decision })
    .eq('id', input.quoteId)
    .eq('customer_account_id', account.id)
    .select('vehicle_id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Failed to update quote.' };
  revalidatePath(customerVehicle(data.vehicle_id));
  return { ok: true, message: `Quote ${input.decision}.` };
}

export async function markNotificationRead(notificationId: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from('notifications').update({ is_read: true }).eq('id', notificationId);
  revalidatePath('/notifications');
}
