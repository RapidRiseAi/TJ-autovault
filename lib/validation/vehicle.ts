import { z } from 'zod';

const currentYear = new Date().getFullYear();

export const registrationValidator = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9-]{3,12}$/, 'Registration must be 3-12 chars (A-Z, 0-9, -)');

export const vinValidator = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-HJ-NPR-Z0-9]{17}$/, 'VIN must be 17 chars and cannot include I, O, Q')
  .optional()
  .or(z.literal(''));

export const yearValidator = z.number().int().min(1900).max(currentYear + 1).nullable();
export const odometerValidator = z.number().int().min(0).max(5_000_000).nullable();

export const addVehicleSchema = z.object({
  registrationNumber: registrationValidator,
  make: z.string().trim().min(1),
  model: z.string().trim().min(1),
  year: yearValidator,
  vin: vinValidator,
  currentMileage: odometerValidator,
  notes: z.string().trim().max(500).optional().or(z.literal(''))
});
