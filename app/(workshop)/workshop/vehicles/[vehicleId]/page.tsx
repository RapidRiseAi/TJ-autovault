import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { UploadsSection } from '@/components/customer/uploads-section';
import { VehicleWorkflowActions } from '@/components/workshop/vehicle-workflow-actions';
import { UploadsActionsForm } from '@/components/workshop/uploads-actions-form';
import { RecentActivitySnippet } from '@/components/customer/vehicle-activity';
import { buildActivityStream } from '@/lib/activity-stream';

function centsToCurrency(totalCents: number | null) {
  if (typeof totalCents !== 'number') return 'R0.00';
  return `R${(totalCents / 100).toFixed(2)}`;
}

export default async function WorkshopVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return (
      <main>
        <Card>
          <h1 className="text-xl font-semibold">Unable to load vehicle</h1>
          <p className="mt-2 text-sm text-gray-600">Your workshop access could not be verified.</p>
        </Card>
      </main>
    );
  }

  const workshopId = profile.workshop_account_id;

  const [
    vehicleResult,
    jobsResult,
    recsResult,
    timelineResult,
    quotesResult,
    invoicesResult,
    docsResult,
    workRequestsResult
  ] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,year,vin,odometer_km,current_customer_account_id,workshop_account_id,primary_image_path,status,next_service_km,next_service_date')
      .eq('id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
    supabase
      .from('service_jobs')
      .select('id,status,complaint')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('opened_at', { ascending: false }),
    supabase
      .from('recommendations')
      .select('id,title,status,severity')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_timeline_events')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),
    supabase
      .from('quotes')
      .select('id,status,total_cents')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id,status,payment_status,total_cents')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_documents')
      .select('id,storage_bucket,storage_path,original_name,created_at,document_type,subject,importance')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),
    supabase
      .from('work_requests')
      .select('id,status')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
  ]);

  const queryErrors = [
    vehicleResult.error,
    jobsResult.error,
    recsResult.error,
    timelineResult.error,
    quotesResult.error,
    invoicesResult.error,
    docsResult.error,
    workRequestsResult.error
  ].filter(Boolean);

  if (queryErrors.length > 0) {
    return (
      <main>
        <Card>
          <h1 className="text-xl font-semibold">Unable to load vehicle</h1>
          <p className="mt-2 text-sm text-gray-600">There was a problem loading one or more data sections. Please refresh and try again.</p>
        </Card>
      </main>
    );
  }

  const vehicle = vehicleResult.data;
  if (!vehicle) {
    return (
      <main>
        <Card>
          <h1 className="text-xl font-semibold">Vehicle not found</h1>
          <p className="mt-2 text-sm text-gray-600">This vehicle does not exist for your workshop account.</p>
        </Card>
      </main>
    );
  }

  const { data: jobs = [] } = jobsResult;
  const { data: recs = [] } = recsResult;
  const { data: timeline = [] } = timelineResult;
  const { data: quotes = [] } = quotesResult;
  const { data: invoices = [] } = invoicesResult;
  const { data: docs = [] } = docsResult;
  const { data: workRequests = [] } = workRequestsResult;

  const safeJobs = Array.isArray(jobs) ? jobs : [];
  const safeRecs = Array.isArray(recs) ? recs : [];
  const safeTimeline = Array.isArray(timeline) ? timeline : [];
  const safeQuotes = Array.isArray(quotes) ? quotes : [];
  const safeInvoices = Array.isArray(invoices) ? invoices : [];
  const safeDocs = Array.isArray(docs) ? docs : [];
  const safeWorkRequests = Array.isArray(workRequests) ? workRequests : [];

  const timelineRows = await Promise.all(safeTimeline.map(async (event) => ({ ...event, actorLabel: await buildTimelineActorLabel(supabase as never, event) })));
  const attachments = safeDocs.map((d) => ({
    id: d.id,
    bucket: d.storage_bucket,
    storage_path: d.storage_path,
    original_name: d.original_name,
    created_at: d.created_at,
    document_type: d.document_type,
    subject: d.subject,
    importance: d.importance
  }));
  const activity = buildActivityStream(timelineRows, safeDocs);

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex items-center gap-4">
          {vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt="Vehicle" className="h-20 w-20 rounded object-cover" /> : null}
          <div className="space-y-2">
            <h1 className="text-2xl font-bold">{vehicle.registration_number}</h1>
            <p>{vehicle.make} {vehicle.model}</p>
            <p className="text-xs">Status: {vehicle.status} · Odometer {vehicle.odometer_km ?? 'N/A'} km · Next service {vehicle.next_service_km ?? 'N/A'} km / {vehicle.next_service_date ?? 'N/A'}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild size="sm" variant="outline">
                <Link href={`/workshop/vehicles/${vehicle.id}/documents`}>View all documents</Link>
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href={`/workshop/vehicles/${vehicle.id}/timeline`}>View full timeline</Link>
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Recent activity</h2>
        <RecentActivitySnippet activities={activity} maxItems={4} timelineHref={`/workshop/vehicles/${vehicle.id}/timeline`} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <h2 className="font-semibold">Overview</h2>
            <p className="text-sm">Open jobs: {safeJobs.filter((job) => job.status !== 'completed' && job.status !== 'cancelled').length}</p>
            <p className="mt-1 text-sm">Open requests: {safeWorkRequests.filter((request) => !['completed', 'delivered', 'cancelled'].includes(request.status)).length}</p>
            <Button asChild size="sm" variant="outline" className="mt-3">
              <Link href="/workshop/work-requests">Open work request board</Link>
            </Button>
          </Card>

          <Card>
            <UploadsSection vehicleId={vehicle.id} attachments={attachments} />
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <h2 className="font-semibold">Recommendations</h2>
              {safeRecs.map((recommendation) => <p key={recommendation.id} className="text-sm">{recommendation.title} · {recommendation.status} · {recommendation.severity}</p>)}
            </Card>
            <Card>
              <h2 className="font-semibold">Mileage / payment / jobs</h2>
              <VehicleWorkflowActions
                vehicleId={vehicle.id}
                invoices={safeInvoices.map((invoice) => ({ id: invoice.id }))}
                jobs={safeJobs.map((job) => ({ id: job.id }))}
                workRequests={safeWorkRequests.map((request) => ({ id: request.id, status: request.status }))}
                compact
              />
            </Card>
          </div>

          <Card>
            <h2 className="font-semibold">Quotes & invoices</h2>
            {safeQuotes.map((quote) => <p key={quote.id} className="text-sm">Quote {quote.status} · {centsToCurrency(quote.total_cents)}</p>)}
            {safeInvoices.map((invoice) => <p key={invoice.id} className="text-sm">Invoice {invoice.status}/{invoice.payment_status} · {centsToCurrency(invoice.total_cents)}</p>)}
          </Card>
        </div>

        <UploadsActionsForm vehicleId={vehicle.id} />
      </div>
    </main>
  );
}
