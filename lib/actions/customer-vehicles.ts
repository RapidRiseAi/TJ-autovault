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
    const { data: vehicleId, error } = await supabase.rpc('create_vehicle_with_ownership_and_timeline', {
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

export async function createSupportTicket(input: {
  vehicleId?: string;
  category: 'account' | 'vehicle' | 'service' | 'billing' | 'other';
  message: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: account } = await supabase
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .eq('auth_user_id', (await supabase.auth.getUser()).data.user?.id ?? '')
    .single();

  if (!account) return { ok: false, error: 'Customer account missing.' };

  const { error, data } = await supabase
    .from('support_tickets')
    .insert({
      workshop_account_id: account.workshop_account_id,
      customer_account_id: account.id,
      vehicle_id: input.vehicleId ?? null,
      category: input.category,
      message: input.message
    })
    .select('id')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not create ticket' };

  if (input.vehicleId) {
    await supabase.rpc('add_vehicle_timeline_event', {
      p_workshop_account_id: account.workshop_account_id,
      p_customer_account_id: account.id,
      p_vehicle_id: input.vehicleId,
      p_event_type: 'ticket_created',
      p_title: 'Support ticket created',
      p_body: input.message,
      p_meta: { ticket_id: data.id }
    });
    revalidatePath(customerVehicle(input.vehicleId));
  }

  return { ok: true, message: 'Ticket created' };
}

export async function approveOrDeclineRecommendation(input: {
  recommendationId: string;
  decision: 'approved' | 'declined';
  note?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const userId = (await supabase.auth.getUser()).data.user?.id;
  if (!userId) return { ok: false, error: 'Unauthorized' };

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', userId)
    .single();

  if (!customerAccount) return { ok: false, error: 'Customer account missing.' };

  const { data: rec, error } = await supabase
    .from('service_recommendations')
    .update({ status: input.decision, customer_note: input.note ?? null })
    .eq('id', input.recommendationId)
    .eq('customer_account_id', customerAccount.id)
    .select('vehicle_id,workshop_account_id')
    .single();

  if (error || !rec) return { ok: false, error: error?.message ?? 'Could not update recommendation' };

  await supabase.rpc('add_vehicle_timeline_event', {
    p_workshop_account_id: rec.workshop_account_id,
    p_customer_account_id: customerAccount.id,
    p_vehicle_id: rec.vehicle_id,
    p_event_type: 'recommendation_status_changed',
    p_title: `Recommendation ${input.decision}`,
    p_body: input.note ?? null,
    p_meta: { recommendation_id: input.recommendationId }
  });

  revalidatePath(customerVehicle(rec.vehicle_id));
  return { ok: true, message: 'Recommendation updated' };
}
