import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { ReportIssueForm } from '@/components/customer/report-issue-form';

const events = [
  'Booking created',
  'Checked in',
  'Inspection completed',
  'Quote uploaded',
  'Quote approved',
  'Work started'
];

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

  const { data: reports } = await supabase
    .from('customer_reports')
    .select('id,category,severity,description,created_at')
    .eq('vehicle_id', id)
    .order('created_at', { ascending: false })
    .limit(5);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">
        {vehicle.registration_number} {vehicle.make ? `• ${vehicle.make} ${vehicle.model ?? ''}` : ''}
      </h1>

      <Card>
        <ReportIssueForm vehicleId={id} />
      </Card>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Recent reports</h2>
        <ul className="space-y-2 text-sm">
          {(reports ?? []).length === 0 ? <li className="text-gray-600">No reports submitted yet.</li> : null}
          {(reports ?? []).map((report) => (
            <li key={report.id} className="rounded bg-gray-50 p-2">
              <p className="font-medium">{report.category}</p>
              <p className="text-xs uppercase text-gray-500">Priority: {report.severity}</p>
              <p>{report.description}</p>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="md:col-span-2">
          <h2 className="mb-2 text-lg font-semibold">Timeline (append-only)</h2>
          <ul className="space-y-2 text-sm">
            {events.map((event) => (
              <li key={event} className="rounded bg-gray-50 p-2">
                {event}
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Actions</h2>
          <ul className="space-y-2 text-sm">
            <li>Upload payment proof</li>
            <li>Approve / decline quote</li>
            <li>Submit problem report</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
