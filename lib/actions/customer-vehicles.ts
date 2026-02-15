'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { customerDashboard, customerVehicle } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

const createVehicleSchema = z.object({
  registrationNumber: z
    .string()
    .trim()
    .min(1, 'Registration / plate number is required')
    .max(20),
  make: z.string().trim().min(1, 'Make is required').max(80),
  model: z.string().trim().min(1, 'Model is required').max(80),
  year: z
    .union([z.number().int().min(1900).max(2100), z.null()])
    .optional()
    .transform((value) => value ?? null),
  vin: z
    .string()
    .trim()
    .max(64)
    .optional()
    .transform((value) => value || null),
  currentMileage: z
    .union([z.number().int().min(0).max(5_000_000), z.null()])
    .optional()
    .transform((value) => value ?? null),
  notes: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((value) => value || null)
});

export async function createCustomerVehicle(input: unknown) {
  const payload = createVehicleSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const { data: customerAccount, error: customerAccountError } = await supabase
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .eq('auth_user_id', user.id)
    .single();

  if (customerAccountError || !customerAccount) {
    throw customerAccountError ?? new Error('Customer account not found');
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .insert({
      workshop_account_id: customerAccount.workshop_account_id,
      current_customer_account_id: customerAccount.id,
      registration_number: payload.registrationNumber,
      make: payload.make,
      model: payload.model,
      year: payload.year,
      vin: payload.vin,
      odometer_km: payload.currentMileage,
      status: 'pending_verification'
    })
    .select('id')
    .single();

  if (vehicleError || !vehicle) {
    throw vehicleError ?? new Error('Failed to create vehicle');
  }

  const { error: ownershipError } = await supabase
    .from('vehicle_ownership_history')
    .insert({
      vehicle_id: vehicle.id,
      from_customer_account_id: null,
      to_customer_account_id: customerAccount.id,
      transferred_by: user.id
    });

  if (ownershipError) throw ownershipError;

  const { error: timelineError } = await supabase
    .from('timeline_events')
    .insert({
      workshop_account_id: customerAccount.workshop_account_id,
      vehicle_id: vehicle.id,
      actor_profile_id: user.id,
      event_type: 'vehicle_added_by_customer',
      payload: {
        message: 'Vehicle added by customer (pending verification)',
        notes: payload.notes
      }
    });

  if (timelineError) throw timelineError;

  revalidatePath(customerDashboard());
  revalidatePath(customerVehicle(vehicle.id));

  redirect(customerVehicle(vehicle.id));
}
