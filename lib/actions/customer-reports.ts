'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { appConfig } from '@/lib/config/app-config';
import { customerVehicle } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

const createCustomerReportSchema = z.object({
  vehicleId: z.string().uuid(),
  title: z.string().trim().min(1, 'Title is required').max(120),
  description: z.string().trim().min(1, 'Description is required').max(2000),
  priority: z.enum(['low', 'medium', 'high']),
  requestQuote: z.boolean(),
  attachments: z
    .array(z.object({ path: z.string().min(1), mimeType: z.string().min(1) }))
    .max(appConfig.uploads.maxImagesPerReport)
});

export async function createCustomerReport(input: unknown) {
  const payload = createCustomerReportSchema.parse(input);
  const supabase = await createClient();

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) throw new Error('Unauthorized');

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id,workshop_account_id,current_customer_account_id')
    .eq('id', payload.vehicleId)
    .single();

  if (vehicleError || !vehicle?.current_customer_account_id) {
    throw new Error('Vehicle not found');
  }

  const { data: membership, error: membershipError } = await supabase
    .from('customer_users')
    .select('id')
    .eq('profile_id', user.id)
    .eq('customer_account_id', vehicle.current_customer_account_id)
    .maybeSingle();

  if (membershipError || !membership) {
    throw new Error('Vehicle not found or access denied');
  }

  const { data: report, error: reportError } = await supabase
    .from('customer_reports')
    .insert({
      workshop_account_id: vehicle.workshop_account_id,
      customer_account_id: vehicle.current_customer_account_id,
      vehicle_id: payload.vehicleId,
      category: payload.title,
      severity: payload.priority,
      description: payload.description
    })
    .select('id')
    .single();

  if (reportError || !report) throw reportError ?? new Error('Failed to create report');

  if (payload.attachments.length > 0) {
    const rows = payload.attachments.map((attachment) => ({
      workshop_account_id: vehicle.workshop_account_id,
      entity_type: 'customer_report',
      entity_id: report.id,
      storage_path: attachment.path,
      mime_type: attachment.mimeType,
      created_by: user.id
    }));

    const { error: attachmentError } = await supabase.from('attachments').insert(rows);
    if (attachmentError) throw attachmentError;
  }

  const { error: timelineError } = await supabase.from('timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    vehicle_id: payload.vehicleId,
    actor_profile_id: user.id,
    event_type: 'customer_report_created',
    payload: {
      report_id: report.id,
      title: payload.title,
      priority: payload.priority,
      request_quote: payload.requestQuote,
      attachment_count: payload.attachments.length
    }
  });

  if (timelineError) throw timelineError;

  revalidatePath(customerVehicle(payload.vehicleId));
  return { reportId: report.id };
}
