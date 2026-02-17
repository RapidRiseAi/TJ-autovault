import { z } from 'zod';

const currentYear = new Date().getFullYear();

const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2] as const;
const VIN_MAP: Record<string, number> = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
};

function isValidVinChecksum(vin: string) {
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) return false;
  const sum = vin.split('').reduce((acc, char, index) => acc + (VIN_MAP[char] ?? 0) * VIN_WEIGHTS[index], 0);
  const remainder = sum % 11;
  const checkChar = remainder === 10 ? 'X' : String(remainder);
  return vin[8] === checkChar;
}

export const registrationValidator = z.string().trim().transform((value) => value.replace(/\s+/g, ' ').toUpperCase()).refine(
  (value) => /^[A-Z0-9\- ]{5,12}$/.test(value),
  'Registration must be 5-12 chars (A-Z, 0-9, spaces, -)'
);

export const vinValidator = z
  .string()
  .trim()
  .toUpperCase()
  .refine((value) => value.length === 0 || /^[A-HJ-NPR-Z0-9]{17}$/.test(value), 'VIN must be 17 chars and cannot include I, O, Q')
  .refine((value) => value.length === 0 || isValidVinChecksum(value), 'VIN checksum is invalid')
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
