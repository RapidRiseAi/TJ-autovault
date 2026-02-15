'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const createVehicleSchema = z.object({
  registrationNumber: z.string().trim().min(1, 'Registration / plate number is required').max(20),
  make: z.string().trim().min(1, 'Make is required').max(80),
  model: z.string().trim().min(1, 'Model is required').max(80),
  year: z
    .union([z.number().int().min(1900).max(2100), z.null()])
    .optional()
    .transform((value) => value ?? null),
  vin: z.string().trim().max(64).optional().transform((value) => value || null),
  currentMileage: z
    .union([z.number().int().min(0).max(5_000_000), z.null()])
    .optional()
    .transform((value) => value ?? null),
  notes: z.string().trim().max(500).optional().transform((value) => value || null)
});

export async function createCustomerVehicle(input: unknown) {
  const payload = createVehicleSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const { data, error } = await supabase.rpc('create_customer_vehicle', {
    p_registration_number: payload.registrationNumber,
    p_make: payload.make,
    p_model: payload.model,
    p_year: payload.year,
    p_vin: payload.vin,
    p_odometer_km: payload.currentMileage,
    p_notes: payload.notes
  });

  if (error || !data) throw error ?? new Error('Failed to create vehicle');

  revalidatePath('/customer/dashboard');
  revalidatePath(`/customer/vehicles/${data}`);

  return { vehicleId: data as string };
}
