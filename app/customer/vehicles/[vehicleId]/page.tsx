import Link from 'next/link';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { RequestForm, MileageForm, QuoteDecisionButtons } from '@/components/customer/vehicle-actions';
import { UploadsSection } from '@/components/customer/uploads-section';
import { Card } from '@/components/ui/card';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

function VehicleAccessErrorPanel() {
  return (
    <main className="space-y-4">
      <Card className="space-y-2">
        <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
        <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        <Link href={customerDashboard()} className="text-sm text-brand-red underline">Back to dashboard</Link>
      </Card>
    </main>
  );
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();

  if (!context) {
    return <VehicleAccessErrorPanel />;
  }

  const customerAccountId = context.customer_account.id;

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,vin,odometer_km,status,current_customer_account_id')
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccountId)
    .maybeSingle();

  if (!vehicle) {
    return <VehicleAccessErrorPanel />;
  }

  const [{ data: timeline }, { data: quotes }, { data: invoices }, { data: requests }, { data: recommendations }, { data: documents }] = await Promise.all([
    supabase.from('vehicle_timeline_events').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }).limit(50),
    supabase.from('quotes').select('id,status,total_cents,created_at').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id,status,payment_status,total_cents,due_date,created_at').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('work_requests').select('id,request_type,status,preferred_date,created_at').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('recommendations').select('id,title,description,severity,status_text,created_at').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false }),
    supabase.from('vehicle_media').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false })
  ]);

  const attachments = (documents ?? []).map((d) => ({ id: d.id, bucket: d.storage_bucket, storage_path: d.storage_path, original_name: d.file_name, mime_type: d.content_type, size_bytes: d.size_bytes, created_at: d.created_at }));

  return (
    <main className="space-y-4">
      <Card><h1 className="text-2xl font-bold">{vehicle.registration_number}</h1><p className="text-sm text-gray-600">{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p><p className="text-xs uppercase">Status: {vehicle.status} · Odometer: {vehicle.odometer_km ?? 'N/A'} km</p></Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2"><h2 className="text-lg font-semibold">Timeline</h2>{(timeline ?? []).map((event) => <div key={event.id} className="border-l-2 border-brand-red pl-3"><p className="text-sm font-medium">{event.title}</p><p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()}</p>{event.description ? <p className="text-sm">{event.description}</p> : null}</div>)}</Card>
        <Card className="space-y-2"><h2 className="text-lg font-semibold">Quotes</h2>{(quotes ?? []).map((q) => <div key={q.id} className="rounded border p-2 text-sm">{q.status} · R{(q.total_cents / 100).toFixed(2)}<QuoteDecisionButtons quoteId={q.id} /></div>)}<h2 className="pt-3 text-lg font-semibold">Invoices</h2>{(invoices ?? []).map((i) => <p key={i.id} className="text-sm">{i.status}/{i.payment_status} · R{(i.total_cents / 100).toFixed(2)} · due {i.due_date ?? 'n/a'}</p>)}</Card>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 text-lg font-semibold">Requests</h2>{(requests ?? []).map((r) => <p key={r.id} className="text-sm">{r.request_type} · {r.status}</p>)}<RequestForm vehicleId={vehicle.id} /></Card>
        <Card><h2 className="mb-2 text-lg font-semibold">Recommendations</h2>{(recommendations ?? []).map((rec) => <p key={rec.id} className="text-sm">{rec.title} · {rec.status_text}</p>)}</Card>
      </section>

      <Card><UploadsSection vehicleId={vehicle.id} attachments={attachments} /></Card>
      <Card><ReportIssueForm vehicleId={vehicle.id} /></Card>
      <Card><MileageForm vehicleId={vehicle.id} /></Card>

      <Link href={customerDashboard()} className="text-sm text-brand-red underline">Back to dashboard</Link>
    </main>
  );
}
