import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

type PublicWorkshopContact = {
  name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  website_url: string | null;
  booking_url: string | null;
  contact_signature: string | null;
};

export default async function ContactPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  const { data: profile } = user
    ? await supabase
        .from('profiles')
        .select('workshop_account_id')
        .eq('id', user.id)
        .maybeSingle()
    : { data: null };

  let workshop: PublicWorkshopContact | null = null;

  if (profile?.workshop_account_id) {
    const { data } = await supabase
      .from('workshop_accounts')
      .select(
        'name,contact_email,contact_phone,website_url,booking_url,contact_signature'
      )
      .eq('id', profile.workshop_account_id)
      .maybeSingle();
    workshop = data;
  } else {
    const { data } = await supabase
      .rpc('get_public_workshop_contact')
      .maybeSingle();
    workshop = (data as PublicWorkshopContact | null) ?? null;
  }

  const workshopNameFallback = profile?.workshop_account_id
    ? 'Workshop'
    : 'Main workshop';

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-10">
      <Card className="space-y-4 rounded-3xl border border-black/10 p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-gray-900">Contact workshop</h1>
        <p className="text-sm text-gray-700">
          Contact details are provided by your workshop admin from the workshop
          profile settings.
        </p>

        <dl className="grid gap-3 rounded-2xl border border-black/10 bg-zinc-50 p-4 text-sm">
          <div>
            <dt className="font-semibold text-gray-900">Workshop</dt>
            <dd className="text-gray-700">
              {workshop?.name ?? workshopNameFallback}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-900">Email</dt>
            <dd className="text-gray-700">
              {workshop?.contact_email ?? 'Not provided yet'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-900">Phone</dt>
            <dd className="text-gray-700">
              {workshop?.contact_phone ?? 'Not provided yet'}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-900">Website</dt>
            <dd className="text-gray-700">
              {workshop?.website_url ? (
                <a
                  href={workshop.website_url}
                  className="text-brand-red underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {workshop.website_url}
                </a>
              ) : (
                'Not provided yet'
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-900">Booking link</dt>
            <dd className="text-gray-700">
              {workshop?.booking_url ? (
                <a
                  href={workshop.booking_url}
                  className="text-brand-red underline"
                  target="_blank"
                  rel="noreferrer"
                >
                  {workshop.booking_url}
                </a>
              ) : (
                'Not provided yet'
              )}
            </dd>
          </div>
          <div>
            <dt className="font-semibold text-gray-900">
              Signature / sign-off
            </dt>
            <dd className="whitespace-pre-wrap text-gray-700">
              {workshop?.contact_signature ?? 'Not provided yet'}
            </dd>
          </div>
        </dl>

        <p className="text-sm text-gray-700">
          Missing details? Ask your workshop admin to update{' '}
          <span className="font-semibold">Workshop profile</span>.
        </p>
        <p className="text-sm text-gray-700">
          Looking for self-help? Go to the{' '}
          <Link href="/help" className="font-semibold text-brand-red underline">
            Help center
          </Link>
          .
        </p>
      </Card>
    </main>
  );
}
