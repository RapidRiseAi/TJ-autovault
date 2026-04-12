import Link from 'next/link';
import { CustomerVehicleDetailView } from '@/components/customer/customer-vehicle-detail-view';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  customerDashboard,
  customerVehicleDocuments,
  customerVehicleTimeline
} from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { formatJobCardStatus, jobProgressIndex } from '@/lib/job-cards';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

function VehicleAccessErrorPanel() {
  return (
    <main className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
        <p className="text-sm text-gray-700">
          Vehicle not found or you don&apos;t have access.
        </p>
        <Button asChild size="sm" variant="secondary" className="mt-3">
          <Link href={customerDashboard()}>Back to dashboard</Link>
        </Button>
      </Card>
    </main>
  );
}

export default async function VehicleDetailPage({
  params
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return <VehicleAccessErrorPanel />;

  const customerAccountId = context.customer_account.id;
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select(
      'id,registration_number,make,model,year,odometer_km,status,next_service_km,next_service_date,primary_image_path'
    )
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccountId)
    .maybeSingle();

  if (!vehicle) return <VehicleAccessErrorPanel />;

  const [
    { data: quotes },
    { data: invoices },
    { data: requests },
    { data: recommendations },
    { data: docs },
    { data: customerVehiclesForMessage },
    { data: activeJob },
    { data: latestJobUpdate }
  ] = await Promise.all([
    supabase
      .from('quotes')
      .select('id,status,total_cents,created_at')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id,status,payment_status,total_cents,due_date,created_at')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('work_requests')
      .select('id,request_type,status,priority,created_at')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('recommendations')
      .select('id,title,description,severity,status,status_text')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_documents')
      .select(
        'id,storage_bucket,storage_path,original_name,created_at,document_type,subject,importance'
      )
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicles')
      .select('id,registration_number')
      .eq('current_customer_account_id', customerAccountId)
      .order('registration_number', { ascending: true }),
    supabase
      .from('job_cards')
      .select('id,status,title,last_updated_at')
      .eq('vehicle_id', vehicleId)
      .in('status', ['not_started', 'in_progress', 'waiting_parts', 'waiting_approval', 'quality_check', 'ready', 'completed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('job_card_updates')
      .select('id,message,created_at,job_card_id')
      .order('created_at', { ascending: false })
      .limit(50)
  ]);


  const latestUpdate = (latestJobUpdate ?? []).find((row) => row.job_card_id === activeJob?.id) ?? null;

  const attachments = (docs ?? []).map((d) => ({
    id: d.id,
    bucket: d.storage_bucket,
    storage_path: d.storage_path,
    original_name: d.original_name,
    created_at: d.created_at,
    document_type: d.document_type,
    subject: d.subject,
    importance: d.importance
  }));

  return (
    <main className="space-y-4">

      {activeJob ? (
        <Card className="rounded-2xl border border-neutral-200 bg-white p-4">
          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Job status</p>
          <div className="mt-2 flex items-center justify-between gap-2">
            <div>
              <p className="text-lg font-semibold text-black">{formatJobCardStatus(activeJob.status)}</p>
              <p className="text-xs text-gray-500">{activeJob.title}</p>
            </div>
            <Button asChild size="sm"><Link href={`/customer/jobs/${activeJob.id}`}>Open job details</Link></Button>
          </div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {['Not started', 'In progress', 'Waiting', 'Quality check', 'Completed'].map((step, index) => (
              <div key={step} className={`rounded-lg px-2 py-1 text-center text-[11px] ${index <= jobProgressIndex(activeJob.status) ? 'bg-black text-white' : 'bg-neutral-100 text-gray-500'}`}>{step}</div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-600">{latestUpdate?.message ?? 'No customer update yet.'}</p>
          <p className="text-[11px] text-gray-400">{latestUpdate?.created_at ? new Date(latestUpdate.created_at).toLocaleString() : ''}</p>
        </Card>
      ) : null}

      <CustomerVehicleDetailView
        vehicle={vehicle}
        timeline={[]}
        quotes={quotes ?? []}
        invoices={invoices ?? []}
        requests={requests ?? []}
        recommendations={recommendations ?? []}
        attachments={attachments}
        timelineHref={customerVehicleTimeline(vehicle.id)}
        documentsHref={customerVehicleDocuments(vehicle.id)}
        editHref={`/customer/vehicles/${vehicle.id}/edit`}
        dashboardHref={customerDashboard()}
        customerVehiclesForMessage={customerVehiclesForMessage ?? []}
      />
    </main>
  );
}
