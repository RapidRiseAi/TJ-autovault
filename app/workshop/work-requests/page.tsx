import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopWorkRequestsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const { data: requests } = await supabase
    .from('work_requests')
    .select('id,request_type,status,preferred_date,created_at,vehicles(registration_number),customer_accounts(name)')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('created_at', { ascending: false });

  return (
    <main className="space-y-4">
      <PageHeader title="Work requests" subtitle="Review and update active customer requests." />
      <Card>
        <div className="space-y-3">
          {(requests ?? []).map((request) => (
            <Link key={request.id} href={`/workshop/work-requests/${request.id}`} className="block rounded-2xl border border-black/10 bg-white p-4 shadow-[0_6px_24px_rgba(17,17,17,0.04)] transition hover:-translate-y-px">
              <p className="text-sm font-semibold text-black">{request.request_type} · {request.status.replaceAll('_', ' ')}</p>
              <p className="mt-1 text-sm text-gray-700">{request.customer_accounts?.[0]?.name ?? 'Unknown customer'} · {request.vehicles?.[0]?.registration_number ?? 'Unknown registration'}</p>
              <p className="mt-1 text-xs text-gray-500">Preferred: {request.preferred_date ?? 'n/a'} · Created: {new Date(request.created_at).toLocaleString()}</p>
            </Link>
          ))}
          {!requests?.length ? <p className="text-sm text-gray-500">No work requests yet.</p> : null}
        </div>
      </Card>
    </main>
  );
}
