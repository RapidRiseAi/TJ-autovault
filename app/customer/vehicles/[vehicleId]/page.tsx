import Link from 'next/link';
import { ReportIssueForm } from '@/components/customer/report-issue-form';
import { RequestForm, MileageForm, QuoteDecisionButtons, RecommendationDecisionButtons } from '@/components/customer/vehicle-actions';
import { UploadsSection } from '@/components/customer/uploads-section';
import { CustomerUploadActions } from '@/components/customer/customer-upload-actions';
import { RecentActivitySnippet, buildActivityStream } from '@/components/customer/vehicle-activity';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RemoveVehicleButton } from '@/components/customer/remove-vehicle-button';
import { customerDashboard, customerVehicleDocuments, customerVehicleTimeline } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { buildTimelineActorLabel } from '@/lib/timeline';

function VehicleAccessErrorPanel() {
  return (
    <main className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
        <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        <Button asChild size="sm" variant="outline" className="mt-3">
          <Link href={customerDashboard()}>Back to dashboard</Link>
        </Button>
      </Card>
    </main>
  );
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return <VehicleAccessErrorPanel />;

  const customerAccountId = context.customer_account.id;
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,odometer_km,status,next_service_km,next_service_date,primary_image_path')
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccountId)
    .maybeSingle();

  if (!vehicle) return <VehicleAccessErrorPanel />;

  const [{ data: timeline }, { data: quotes }, { data: invoices }, { data: requests }, { data: recommendations }, { data: docs }] = await Promise.all([
    supabase
      .from('vehicle_timeline_events')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
      .limit(50),
    supabase
      .from('quotes')
      .select('id,status,total_cents')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id,status,payment_status,total_cents,due_date')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('work_requests')
      .select('id,request_type,status')
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
      .select('id,storage_bucket,storage_path,original_name,created_at,document_type,subject,importance')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
  ]);

  const timelineRows = await Promise.all((timeline ?? []).map(async (event) => ({ ...event, actorLabel: await buildTimelineActorLabel(supabase as never, event) })));
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
  const activity = buildActivityStream(timelineRows, docs ?? []);

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          {vehicle.primary_image_path ? (
            <img
              src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
              alt="Vehicle"
              className="h-20 w-20 rounded object-cover"
            />
          ) : null}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{vehicle.registration_number}</h1>
            <p className="text-sm text-gray-600">
              {vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}
            </p>
            <p className="text-xs uppercase">
              Status: {vehicle.status} · Odometer: {vehicle.odometer_km ?? 'N/A'} km · Service: {vehicle.next_service_km ?? 'N/A'} km / {vehicle.next_service_date ?? 'N/A'}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/customer/vehicles/${vehicle.id}/edit`}>Edit vehicle</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={customerVehicleDocuments(vehicle.id)}>View all documents</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={customerVehicleTimeline(vehicle.id)}>View full timeline</Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <section id="recent-activity">
        <Card>
          <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
          <RecentActivitySnippet activities={activity} maxItems={4} timelineHref={customerVehicleTimeline(vehicle.id)} />
        </Card>
      </section>

      <section id="quotes">
        <Card>
          <h2 className="text-lg font-semibold">Quotes</h2>
          {(quotes ?? []).map((q) => (
            <div key={q.id} className="my-2 rounded border p-2 text-sm">
              {q.status} · R{(q.total_cents / 100).toFixed(2)}
              <QuoteDecisionButtons quoteId={q.id} />
            </div>
          ))}
        </Card>
      </section>

      <section id="invoices">
        <Card>
          <h2 className="text-lg font-semibold">Invoices</h2>
          {(invoices ?? []).map((invoice) => (
            <p key={invoice.id} className="text-sm">
              {invoice.status}/{invoice.payment_status} · R{(invoice.total_cents / 100).toFixed(2)} · due {invoice.due_date ?? 'n/a'}
            </p>
          ))}
        </Card>
      </section>

      <Card>
        <h2 className="mb-2 text-lg font-semibold">Requests</h2>
        {(requests ?? []).map((request) => (
          <p key={request.id} className="text-sm">
            {request.request_type} · {request.status}
          </p>
        ))}
        <RequestForm vehicleId={vehicle.id} />
      </Card>

      <section id="recommendations">
        <Card>
          <h2 className="mb-2 text-lg font-semibold">Recommendations</h2>
          {(recommendations ?? []).map((rec) => (
            <div key={rec.id} className="mb-2 rounded border p-2 text-sm">
              <p>
                {rec.title} · {rec.status ?? rec.status_text} · {rec.severity}
              </p>
              {rec.description ? <p className="text-xs text-gray-600">{rec.description}</p> : null}
              <RecommendationDecisionButtons recommendationId={rec.id} />
            </div>
          ))}
        </Card>
      </section>

      <section id="uploads">
        <Card>
          <CustomerUploadActions vehicleId={vehicle.id} />
          <div className="mt-4">
            <UploadsSection vehicleId={vehicle.id} attachments={attachments} />
          </div>
        </Card>
      </section>

      <Card>
        <ReportIssueForm vehicleId={vehicle.id} />
      </Card>
      <Card>
        <MileageForm vehicleId={vehicle.id} />
      </Card>
      <RemoveVehicleButton vehicleId={vehicle.id} />
      <Button asChild size="sm" variant="outline">
        <Link href={customerDashboard()}>Back to dashboard</Link>
      </Button>
    </main>
  );
}
