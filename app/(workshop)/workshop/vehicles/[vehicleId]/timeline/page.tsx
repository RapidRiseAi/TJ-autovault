import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { createClient } from '@/lib/supabase/server';
import { buildActivityStream, HorizontalTimeline } from '@/components/customer/vehicle-activity';

export default async function WorkshopVehicleTimelinePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
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

  const [{ data: vehicle }, { data: timeline, error: timelineError }, { data: documents, error: documentsError }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number')
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
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
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
            <h1 className="text-2xl font-bold">Full timeline</h1>
            <p className="text-sm text-gray-600">{vehicle.registration_number} · Unified activity stream</p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/workshop/vehicles/${vehicleId}`}>Back to vehicle</Link>
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Activity</h2>
        <HorizontalTimeline activities={activity} />
      </Card>
    </main>
  );
}
