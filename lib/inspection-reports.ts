import { z } from 'zod';

export const inspectionFieldTypeSchema = z.enum([
  'checkbox',
  'number',
  'text',
  'dropdown'
]);

export const inspectionTemplateFieldSchema = z.object({
  id: z.string().uuid().optional(),
  field_type: inspectionFieldTypeSchema,
  label: z.string().trim().min(1, 'Label is required'),
  required: z.boolean().default(false),
  options: z.array(z.string().trim().min(1)).optional()
});

export const inspectionTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Template name is required'),
  fields: z.array(inspectionTemplateFieldSchema)
});

export const inspectionAnswerValueSchema = z.union([
  z.boolean(),
  z.number(),
  z.string()
]);

export const inspectionGenerateSchema = z.object({
  vehicleId: z.string().uuid(),
  templateId: z.string().uuid(),
  technicianProfileId: z.string().uuid(),
  notes: z.string().optional(),
  answers: z.record(z.string(), inspectionAnswerValueSchema)
});

export type InspectionTemplateFieldInput = z.infer<
  typeof inspectionTemplateFieldSchema
>;

export type InspectionTemplateInput = z.infer<typeof inspectionTemplateSchema>;

export function normalizeDropdownOptions(input?: unknown) {
  if (!Array.isArray(input)) return null;
  const values = input
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
  return values.length ? values : null;
}

export function formatInspectionResult(
  fieldType: string,
  value: unknown
): string {
  if (fieldType === 'checkbox') {
    return value === true || value === 'ok' ? 'OK' : 'Issue';
  }

  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return '';
}
