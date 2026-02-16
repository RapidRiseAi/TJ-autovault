import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const bucket = request.nextUrl.searchParams.get('bucket');
  const pathParam = request.nextUrl.searchParams.get('path');
  if (!bucket || !pathParam) return NextResponse.json({ error: 'Missing path' }, { status: 400 });
  if (bucket !== 'vehicle-images' && bucket !== 'vehicle-files') return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: doc } = await supabase.from('vehicle_documents').select('customer_account_id').eq('storage_bucket', bucket).eq('storage_path', pathParam).maybeSingle();
  if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: membership } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).eq('id', doc.customer_account_id).maybeSingle();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (!membership && profile?.role === 'customer') return NextResponse.json({ error: 'Access denied' }, { status: 403 });

  const { data: signed, error } = await supabase.storage.from(bucket).createSignedUrl(pathParam, 60);
  if (error || !signed?.signedUrl) return NextResponse.json({ error: error?.message ?? 'Could not sign download URL' }, { status: 400 });
  return NextResponse.redirect(signed.signedUrl);
}
