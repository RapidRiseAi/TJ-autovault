import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

const payloadSchema = z.object({
  dataUrl: z.string().startsWith('data:image/png;base64,'),
  workshopId: z.string().uuid(),
  profileId: z.string().uuid()
});

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

export async function POST(request: Request) {
  const payload = payloadSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid payload.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || profile.id !== payload.data.profileId || profile.workshop_account_id !== payload.data.workshopId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  if (profile.role !== 'technician' && profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const base64Content = payload.data.dataUrl.replace('data:image/png;base64,', '');
  if (!/^[A-Za-z0-9+/=\s]+$/.test(base64Content)) {
    return NextResponse.json({ error: 'Malformed signature image payload.' }, { status: 400 });
  }

  const estimatedBytes = Math.floor((base64Content.replace(/\s+/g, '').length * 3) / 4);
  if (estimatedBytes > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: 'Signature image is too large.' }, { status: 400 });
  }

  const bytes = Buffer.from(base64Content, 'base64');
  if (!bytes.length) {
    return NextResponse.json({ error: 'Signature image is empty.' }, { status: 400 });
  }
  if (bytes.length > MAX_SIGNATURE_BYTES) {
    return NextResponse.json({ error: 'Signature image is too large.' }, { status: 400 });
  }

  const storagePath = `workshop/${payload.data.workshopId}/technicians/${payload.data.profileId}/signature.png`;
  const admin = createAdminClient();
  const { error: uploadError } = await admin.storage.from('vehicle-files').upload(storagePath, bytes, {
    contentType: 'image/png',
    upsert: true
  });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from('profiles')
    .update({
      signature_image_path: storagePath,
      signature_updated_at: now
    })
    .eq('id', payload.data.profileId)
    .eq('workshop_account_id', payload.data.workshopId);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, signature_image_path: storagePath, signature_updated_at: now });
}
