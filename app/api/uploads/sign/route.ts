import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appConfig } from '@/lib/config/app-config';
import { createClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  vehicleId: z.string().uuid(),
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  kind: z.enum(['image', 'document'])
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });

  const { vehicleId, fileName, contentType, kind } = parsed.data;
  const bucket = kind === 'image' ? 'vehicle-images' : 'vehicle-files';
  const allowedDocumentTypes = [...appConfig.uploads.allowedPdfMimeTypes, ...appConfig.uploads.allowedImageMimeTypes];

  if (kind === 'image' && !appConfig.uploads.allowedImageMimeTypes.some((type) => type === contentType)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  if (kind === 'document' && !allowedDocumentTypes.some((type) => type === contentType)) return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: vehicle } = await supabase.from('vehicles').select('id,workshop_account_id,current_customer_account_id').eq('id', vehicleId).single();
  if (!vehicle?.current_customer_account_id) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

  const { data: membership } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).eq('id', vehicle.current_customer_account_id).maybeSingle();
  if (!membership) return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const extension = fileName.split('.').pop()?.toLowerCase() ?? (kind === 'image' ? 'jpg' : 'pdf');
  const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80) || `upload.${extension}`;
  const docType = kind === 'image' ? 'vehicle_photo' : 'other';
  const storagePath = `workshop/${vehicle.workshop_account_id}/customer/${vehicle.current_customer_account_id}/vehicle/${vehicleId}/${docType}/${crypto.randomUUID()}-${sanitizedName}`;

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(storagePath);
  if (error || !data) return NextResponse.json({ error: error?.message ?? 'Could not create upload URL' }, { status: 400 });

  return NextResponse.json({ bucket, path: storagePath, token: data.token, docType });
}
