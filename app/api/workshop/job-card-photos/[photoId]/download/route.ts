import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ photoId: string }> }
) {
  const { photoId } = await params;
  const download = request.nextUrl.searchParams.get('download') === '1';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: photo } = await supabase
    .from('job_card_photos')
    .select('id,storage_path,job_card_id')
    .eq('id', photoId)
    .maybeSingle();

  if (!photo) {
    return NextResponse.json({ error: 'Photo not found' }, { status: 404 });
  }

  const { data: jobCard } = await supabase
    .from('job_cards')
    .select('id,workshop_id,vehicle_id,vehicles(current_customer_account_id)')
    .eq('id', photo.job_card_id)
    .maybeSingle();

  if (!jobCard) {
    return NextResponse.json({ error: 'Job card not found' }, { status: 404 });
  }

  const [{ data: profile }, { data: customerUser }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,workshop_account_id,role')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('customer_users')
      .select('id')
      .eq('profile_id', user.id)
      .eq(
        'customer_account_id',
        Array.isArray(jobCard.vehicles)
          ? jobCard.vehicles[0]?.current_customer_account_id
          : (
              jobCard.vehicles as {
                current_customer_account_id?: string | null;
              } | null
            )?.current_customer_account_id
      )
      .maybeSingle()
  ]);

  const isWorkshopStaff =
    !!profile &&
    profile.workshop_account_id === jobCard.workshop_id &&
    ['admin', 'technician'].includes(profile.role ?? '');

  if (!isWorkshopStaff && !customerUser) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 });
  }

  const { data: signed, error } = await supabase.storage
    .from('vehicle-files')
    .createSignedUrl(
      photo.storage_path,
      60,
      download ? { download: true } : undefined
    );

  if (error || !signed?.signedUrl) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not sign URL' },
      { status: 400 }
    );
  }

  return NextResponse.redirect(signed.signedUrl);
}
