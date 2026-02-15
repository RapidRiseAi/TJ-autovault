import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appConfig } from '@/lib/config/app-config';
import { createClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  vehicleId: z.string().uuid(),
  bucket: z.enum(['private-images', 'private-documents']),
  path: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().nonnegative(),
  originalName: z.string().min(1),
  kind: z.enum(['image', 'document'])
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }

  const payload = parsed.data;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const allowedDocumentTypes = [...appConfig.uploads.allowedPdfMimeTypes, ...appConfig.uploads.allowedImageMimeTypes];
  if (payload.kind === 'image' && !appConfig.uploads.allowedImageMimeTypes.some((mimeType) => mimeType === payload.contentType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }
  if (payload.kind === 'document' && !allowedDocumentTypes.some((mimeType) => mimeType === payload.contentType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id,workshop_account_id,current_customer_account_id')
    .eq('id', payload.vehicleId)
    .single();

  if (vehicleError || !vehicle?.current_customer_account_id) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
  }

  const { data: membership } = await supabase
    .from('customer_users')
    .select('id')
    .eq('profile_id', user.id)
    .eq('customer_account_id', vehicle.current_customer_account_id)
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  if (!payload.path.includes(`/vehicles/${payload.vehicleId}/`)) {
    return NextResponse.json({ error: 'Invalid storage path' }, { status: 400 });
  }

  const { error } = await supabase.from('attachments').insert({
    workshop_account_id: vehicle.workshop_account_id,
    entity_type: 'vehicle',
    entity_id: payload.vehicleId,
    bucket: payload.bucket,
    storage_path: payload.path,
    original_name: payload.originalName,
    size_bytes: payload.size,
    mime_type: payload.contentType,
    created_by: user.id
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
