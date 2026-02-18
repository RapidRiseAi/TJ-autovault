import Link from 'next/link';
import { redirect } from 'next/navigation';
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
      <h1 className="text-2xl font-bold">Work requests</h1>
      <Card>
        <div className="space-y-2">
          {(requests ?? []).map((request) => (
            <Link key={request.id} href={`/workshop/work-requests/${request.id}`} className="block rounded border p-3 text-sm hover:bg-gray-50">
              <p className="font-semibold">{request.request_type} · {request.status.replaceAll('_', ' ')}</p>
              <p>{request.customer_accounts?.[0]?.name ?? 'Unknown customer'} · {request.vehicles?.[0]?.registration_number ?? 'Unknown registration'}</p>
              <p className="text-xs text-gray-500">Preferred: {request.preferred_date ?? 'n/a'} · Created: {new Date(request.created_at).toLocaleString()}</p>
            </Link>
          ))}
          {!requests?.length ? <p className="text-sm text-gray-500">No work requests yet.</p> : null}
        </div>
      </Card>
    </main>
  );
}
