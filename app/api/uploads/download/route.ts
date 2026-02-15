import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get('bucket');
  const pathParam = request.nextUrl.searchParams.get('path');
  if (!bucket || !pathParam) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  if (bucket !== 'private-images' && bucket !== 'private-documents') {
    return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: attachment } = await supabase
    .from('attachments')
    .select('entity_id,entity_type')
    .eq('bucket', bucket)
    .eq('storage_path', pathParam)
    .maybeSingle();

  if (!attachment || attachment.entity_type !== 'vehicle') {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,current_customer_account_id')
    .eq('id', attachment.entity_id)
    .single();

  if (!vehicle?.current_customer_account_id) {
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

  const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrl(pathParam, 60);
  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not sign download URL' }, { status: 400 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
