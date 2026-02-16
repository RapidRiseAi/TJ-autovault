import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  vehicleId: z.string().uuid(),
  bucket: z.enum(['vehicle-images', 'vehicle-files']),
  path: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  originalName: z.string().min(1),
  docType: z.enum(['vehicle_photo', 'license_disk', 'invoice', 'report_photo', 'other'])
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  const payload = parsed.data;

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vehicle } = await supabase.from('vehicles').select('id,workshop_account_id,current_customer_account_id').eq('id', payload.vehicleId).single();
  if (!vehicle?.current_customer_account_id) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const { data: membership } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).eq('id', vehicle.current_customer_account_id).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const { data: doc, error } = await supabase.from('vehicle_documents').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: payload.vehicleId,
    doc_type: payload.docType,
    storage_bucket: payload.bucket,
    storage_path: payload.path,
    original_name: payload.originalName,
    mime_type: payload.contentType,
    size_bytes: payload.size
  }).select('id').single();

  if (error || !doc) return NextResponse.json({ error: error?.message ?? 'Could not save upload metadata' }, { status: 400 });

  if (payload.docType === 'vehicle_photo') {
    await supabase.from('vehicles').update({ vehicle_image_doc_id: doc.id }).eq('id', payload.vehicleId);
  }

  await supabase.rpc('add_vehicle_timeline_event', {
    p_workshop_account_id: vehicle.workshop_account_id,
    p_customer_account_id: vehicle.current_customer_account_id,
    p_vehicle_id: payload.vehicleId,
    p_event_type: 'doc_uploaded',
    p_title: `Document uploaded: ${payload.docType}`,
    p_meta: { doc_id: doc.id }
  });

  return NextResponse.json({ ok: true });
}
