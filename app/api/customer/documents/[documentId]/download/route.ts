import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ documentId: string }> }
) {
  const { documentId } = await params;
  const supabase = await createClient();

  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!customerUser?.customer_account_id) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: document } = await supabase
    .from('vehicle_documents')
    .select('id,storage_bucket,storage_path,customer_account_id,vehicle_id')
    .eq('id', documentId)
    .eq('customer_account_id', customerUser.customer_account_id)
    .maybeSingle();

  if (!document?.storage_bucket || !document.storage_path) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from(document.storage_bucket)
    .createSignedUrl(document.storage_path, 60 * 5);

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create download URL' },
      { status: 400 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
