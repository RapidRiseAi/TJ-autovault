import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ archiveId: string }> }
) {
  const { archiveId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: archive } = await supabase
    .from('workshop_monthly_statement_archives')
    .select('pdf_storage_path')
    .eq('id', archiveId)
    .eq('workshop_account_id', profile.workshop_account_id)
    .maybeSingle();

  if (!archive?.pdf_storage_path) {
    return NextResponse.json({ error: 'Statement PDF not available' }, { status: 404 });
  }

  const { data: signed, error } = await supabase.storage
    .from('vehicle-files')
    .createSignedUrl(archive.pdf_storage_path, 60);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: error?.message ?? 'Could not sign statement URL' }, { status: 400 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
