import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { appConfig } from '@/lib/config/app-config';
import { createClient } from '@/lib/supabase/server';

const requestSchema = z.object({
  vehicleId: z.string().uuid(),
  fileName: z.string().min(1),
  contentType: z.string().min(1)
});

export async function POST(request: NextRequest) {
  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request payload' }, { status: 400 });
  }

  const { vehicleId, fileName, contentType } = parsed.data;

  if (!appConfig.uploads.allowedImageMimeTypes.some((mimeType) => mimeType === contentType)) {
    return NextResponse.json({ error: 'Unsupported file type' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id,current_customer_account_id')
    .eq('id', vehicleId)
    .single();

  if (vehicleError || !vehicle?.current_customer_account_id) {
    return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });
  }

  const { data: membership, error: membershipError } = await supabase
    .from('customer_users')
    .select('id')
    .eq('profile_id', user.id)
    .eq('customer_account_id', vehicle.current_customer_account_id)
    .maybeSingle();

  if (membershipError || !membership) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const extension = fileName.split('.').pop()?.toLowerCase() ?? 'jpg';
  const storagePath = `${vehicleId}/${user.id}/${crypto.randomUUID()}.${extension}`;

  const { data, error } = await supabase.storage.from('private-images').createSignedUploadUrl(storagePath);

  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not create upload URL' }, { status: 400 });
  }

  return NextResponse.json({
    token: data.token,
    path: storagePath,
    signedUrl: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/private-images/${storagePath}?token=${data.token}`
  });
}
