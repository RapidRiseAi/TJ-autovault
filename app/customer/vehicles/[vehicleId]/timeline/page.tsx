import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle } from '@/lib/routes';
import { WorldTimeline } from '@/components/customer/vehicle-activity';
import { buildActivityStream } from '@/lib/activity-stream';
import { PageHeader } from '@/components/layout/page-header';

export default async function VehicleTimelinePage({ params, searchParams }: { params: Promise<{ vehicleId: string }>; searchParams: Promise<{ deletionRequest?: string }> }) {
  const { vehicleId } = await params;
  const { deletionRequest } = await searchParams;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();

  if (!context) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
          <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        </Card>
      </main>
    );
  }

  const customerAccountId = context.customer_account.id;
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model')
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccountId)
    .maybeSingle();

  if (!vehicle) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
          <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        </Card>
      </main>
    );
  }

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('name')
    .eq('id', customerAccountId)
    .maybeSingle();

  const customerName = customerAccount?.name?.trim() || 'Customer';
  const vehicleName = `${vehicle.make?.trim() || ''} ${vehicle.model?.trim() || ''}`.trim() || 'vehicle';
  const timelineTitle = `${customerName}'s ${vehicleName} timeline`;

  const [{ data: timeline }, { data: documents }, { data: deletionRequests }, { data: jobCards }] = await Promise.all([
    supabase
      .from('vehicle_timeline_events')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('vehicle_documents')
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance,invoice_id,quote_id')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('timeline_deletion_requests')
      .select('id,target_kind,target_id,requested_by_role,reason,status')
      .eq('vehicle_id', vehicleId)
      .order('requested_at', { ascending: false })
      .limit(300),
    supabase
      .from('job_cards')
      .select('id,title,status,last_updated_at,created_at')
      .eq('vehicle_id', vehicleId)
      .order('created_at', { ascending: false })
      .limit(100)
  ]);

  const timelineRows = await Promise.all(
    (timeline ?? []).map(async (event) => ({
      ...event,
      actorLabel: await buildTimelineActorLabel(supabase as never, event)
    }))
  );
  const timelineJobIds = new Set(
    (timelineRows ?? [])
      .map((event) =>
        typeof event.metadata?.job_card_id === 'string'
          ? event.metadata.job_card_id
          : null
      )
      .filter((value): value is string => Boolean(value))
  );

  const syntheticJobRows = (jobCards ?? [])
    .filter((job) => !timelineJobIds.has(job.id))
    .map((job) => ({
      id: `job-${job.id}`,
      created_at: job.last_updated_at ?? job.created_at,
      title: `Job card: ${job.title}`,
      description: `Current status: ${(job.status ?? 'unknown').replaceAll('_', ' ')}`,
      importance: 'info',
      actorLabel: 'workshop/system',
      event_type: 'job_card_snapshot',
      metadata: {
        job_card_id: job.id,
        job_status: job.status,
        updated_at: job.last_updated_at
      }
    }));
  const activity = buildActivityStream([...timelineRows, ...syntheticJobRows], documents ?? []);

  return (
    <main className="space-y-4">
      <PageHeader title={timelineTitle} subtitle={`${vehicle.registration_number} · Unified activity stream`} actions={<div className="flex gap-2"><Button asChild variant="secondary" size="sm"><Link href={`/customer/vehicles/${vehicleId}/documents`}>Upload document</Link></Button><Button asChild variant="secondary" size="sm"><Link href={customerVehicle(vehicleId)}>Back to vehicle</Link></Button></div>} />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Activity</h2>
        <WorldTimeline activities={activity} vehicleId={vehicleId} viewerRole="customer" deletionRequests={deletionRequests ?? []} highlightedDeletionRequestId={deletionRequest} />
      </Card>
    </main>
  );
}
