import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { ReportIssueForm } from '@/components/customer/report-issue-form';

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,current_customer_account_id')
    .eq('id', id)
    .single();

  if (!vehicle?.current_customer_account_id) notFound();

  const { data: membership } = await supabase
    .from('customer_users')
    .select('id')
    .eq('profile_id', user.id)
    .eq('customer_account_id', vehicle.current_customer_account_id)
    .maybeSingle();

  if (!membership) notFound();

  const { data: latestWorkOrder } = await supabase
    .from('work_orders')
    .select('status,completed_at,created_at')
    .eq('vehicle_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: timelineEvents } = await supabase
    .from('timeline_events')
    .select('id,event_type,created_at,payload')
    .eq('vehicle_id', id)
    .order('created_at', { ascending: false })
    .limit(8);

  const status = latestWorkOrder?.status ?? 'No active work order';
  const lastService = latestWorkOrder?.completed_at
    ? new Date(latestWorkOrder.completed_at).toLocaleDateString()
    : 'Not recorded yet';

  return (
    <div className="space-y-4">
      <Card className="space-y-1">
        <h1 className="text-2xl font-bold">
          {vehicle.registration_number} {vehicle.make ? `• ${vehicle.make} ${vehicle.model ?? ''}` : ''}
        </h1>
        <p className="text-sm text-gray-600">Status: {status}</p>
        <p className="text-sm text-gray-600">Last service: {lastService}</p>
        <p className="text-sm text-gray-600">Next service due: To be confirmed by workshop</p>
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Timeline</h2>
        <ul className="space-y-2 text-sm">
          {(timelineEvents ?? []).length === 0 ? <li className="text-gray-600">No timeline entries yet.</li> : null}
          {(timelineEvents ?? []).map((event) => (
            <li key={event.id} className="rounded bg-gray-50 p-2">
              <p className="font-medium">{event.event_type.replaceAll('_', ' ')}</p>
              <p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <ReportIssueForm vehicleId={id} />
      </Card>
    </div>
  );
}
