import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { createClient } from '@/lib/supabase/server';
import { HorizontalTimeline } from '@/components/customer/vehicle-activity';
import { buildActivityStream } from '@/lib/activity-stream';

export default async function WorkshopVehicleTimelinePage({ params, searchParams }: { params: Promise<{ vehicleId: string }>; searchParams: Promise<{ deletionRequest?: string }> }) {
  const { vehicleId } = await params;
  const { deletionRequest } = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
          <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        </Card>
      </main>
    );
  }

  const workshopId = profile.workshop_account_id;

  const [{ data: vehicle }, { data: timeline, error: timelineError }, { data: documents, error: documentsError }, { data: deletionRequests }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,current_customer_account_id')
      .eq('id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
    supabase
      .from('vehicle_timeline_events')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('vehicle_documents')
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance,invoice_id')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('timeline_deletion_requests')
      .select('id,target_kind,target_id,requested_by_role,reason,status')
      .eq('vehicle_id', vehicleId)
      .order('requested_at', { ascending: false })
      .limit(300)
  ]);

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


  const { data: customerAccount } = vehicle.current_customer_account_id
    ? await supabase
        .from('customer_accounts')
        .select('name')
        .eq('id', vehicle.current_customer_account_id)
        .maybeSingle()
    : { data: null };

  const customerName = customerAccount?.name?.trim() || 'Customer';
  const vehicleName = `${vehicle.make?.trim() || ''} ${vehicle.model?.trim() || ''}`.trim() || 'vehicle';
  const timelineTitle = `${customerName}'s ${vehicleName} timeline`;

  if (timelineError || documentsError) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Unable to load timeline</h1>
          <p className="text-sm text-gray-700">Please refresh and try again.</p>
        </Card>
      </main>
    );
  }

  const timelineRows = await Promise.all(
    (timeline ?? []).map(async (event) => ({
      ...event,
      actorLabel: await buildTimelineActorLabel(supabase as never, event)
    }))
  );
  const activity = buildActivityStream(timelineRows, documents ?? []);

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">{timelineTitle}</h1>
            <p className="text-sm text-gray-600">{vehicle.registration_number} · Unified activity stream</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={`/workshop/vehicles/${vehicleId}/documents`}>Upload document</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/workshop/vehicles/${vehicleId}`}>Back to vehicle</Link>
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Activity</h2>
        <HorizontalTimeline activities={activity} vehicleId={vehicleId} viewerRole="workshop" deletionRequests={deletionRequests ?? []} highlightedDeletionRequestId={deletionRequest} />
      </Card>
    </main>
  );
}
