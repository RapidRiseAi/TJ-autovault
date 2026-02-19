import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { VehicleDeletionRowActions } from '@/components/workshop/vehicle-deletion-row-actions';

export default async function WorkshopVehicleDeletionRequestsPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const { data: requests } = await supabase
    .from('vehicle_deletion_requests')
    .select('id,status,reason,requested_at,vehicle_id,customer_account_id,vehicles(registration_number),customer_accounts(name)')
    .eq('workshop_account_id', profile.workshop_account_id)
    .in('status', ['pending', 'exported'])
    .order('requested_at', { ascending: false });

  return (
    <main className="space-y-4">
      <PageHeader title="Vehicle deletion requests" subtitle="Export an archive before permanently deleting vehicle data." />

      <div className="space-y-3">
        {(requests ?? []).map((request) => (
          <Card key={request.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{request.vehicles?.[0]?.registration_number ?? request.vehicle_id}</p>
                <p className="text-xs text-gray-600">Customer: {request.customer_accounts?.[0]?.name ?? request.customer_account_id}</p>
                <p className="text-xs text-gray-600">Status: {request.status} · Requested: {new Date(request.requested_at).toLocaleString()}</p>
                {request.reason ? <p className="mt-1 text-xs">Reason: {request.reason}</p> : null}
              </div>
              <VehicleDeletionRowActions requestId={request.id} />
            </div>
          </Card>
        ))}
        {!requests?.length ? <Card><p className="text-sm text-gray-500">No pending requests.</p></Card> : null}
      </div>
    </main>
  );
}
