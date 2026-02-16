import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { UploadsSection } from '@/components/customer/uploads-section';
import { Card } from '@/components/ui/card';
import { customerDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) notFound();

  const { data: customerAccount } = await supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).single();
  if (!customerAccount) notFound();

  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,vin,odometer_km,status,current_customer_account_id,vehicle_image_doc_id,last_service_at,next_service_due_at,next_service_due_km')
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccount.id)
    .single();

  if (!vehicle) notFound();

  const [{ data: timeline }, { data: jobs }, { data: recommendations }, { data: documents }] = await Promise.all([
    supabase.from('vehicle_timeline_events').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccount.id).order('created_at', { ascending: false }).limit(30),
    supabase.from('service_jobs').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccount.id).order('opened_at', { ascending: false }),
    supabase.from('service_recommendations').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccount.id).order('created_at', { ascending: false }),
    supabase.from('vehicle_documents').select('*').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccount.id).order('uploaded_at', { ascending: false })
  ]);

  const attachments = (documents ?? []).map((d) => ({ id: d.id, bucket: d.storage_bucket, storage_path: d.storage_path, original_name: d.original_name, mime_type: d.mime_type, size_bytes: d.size_bytes, created_at: d.uploaded_at }));

  return (
    <main className="space-y-4">
      <Card>
        <h1 className="text-2xl font-bold">{vehicle.registration_number}</h1>
        <p className="text-sm text-gray-600">{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p>
        <p className="text-xs uppercase">Status: {vehicle.status}</p>
      </Card>

      <section className="grid gap-4 lg:grid-cols-2">
        <Card className="space-y-2">
          <h2 className="text-lg font-semibold">Timeline</h2>
          {(timeline ?? []).map((event) => (
            <div key={event.id} className="border-l-2 border-brand-red pl-3">
              <p className="text-sm font-medium">{event.title}</p>
              <p className="text-xs text-gray-500">{new Date(event.created_at).toLocaleString()} • {event.actor_role ?? 'system'}</p>
              {event.body ? <p className="text-sm">{event.body}</p> : null}
            </div>
          ))}
        </Card>

        <Card className="space-y-2">
          <h2 className="text-lg font-semibold">Service history</h2>
          {(jobs ?? []).map((job) => <p key={job.id} className="text-sm">{new Date(job.opened_at).toLocaleDateString()} · {job.status}</p>)}

          <h2 className="pt-2 text-lg font-semibold">Recommendations</h2>
          {(recommendations ?? []).map((rec) => <p key={rec.id} className="text-sm">{rec.title} · {rec.status}</p>)}
        </Card>
      </section>

      <Card><UploadsSection vehicleId={vehicle.id} attachments={attachments} /></Card>
      <Card><ReportIssueForm vehicleId={vehicle.id} /></Card>

      <Link href={customerDashboard()} className="text-sm text-brand-red underline">Back to dashboard</Link>
    </main>
  );
}
