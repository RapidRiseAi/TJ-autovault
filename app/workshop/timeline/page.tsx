import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { buildActivityStream } from '@/lib/activity-stream';
import { HorizontalTimeline } from '@/components/customer/vehicle-activity';

export default async function WorkshopTimelinePage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    redirect('/customer/dashboard');
  }

  const workshopId = profile.workshop_account_id;

  const [{ data: timelineRows, error: timelineError }, { data: documents, error: documentsError }] = await Promise.all([
    supabase
      .from('vehicle_timeline_events')
      .select('*')
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(500),
    supabase
      .from('vehicle_documents')
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance,invoice_id')
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(500)
  ]);

  if (timelineError || documentsError) {
    return (
      <main>
        <Card>
          <h1 className="text-xl font-semibold">Unable to load workshop timeline</h1>
          <p className="text-sm text-gray-600">Please refresh and try again.</p>
        </Card>
      </main>
    );
  }

  const withActors = await Promise.all(
    (timelineRows ?? []).map(async (event) => ({
      ...event,
      actorLabel: await buildTimelineActorLabel(supabase as never, event)
    }))
  );

  const activity = buildActivityStream(withActors, documents ?? []);

  return (
    <main className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Workshop timeline</h1>
            <p className="text-sm text-gray-600">Unified timeline across all vehicles, actions, and documents.</p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href="/workshop/dashboard">Back to dashboard</Link>
          </Button>
        </div>
      </Card>

      <Card>
        <HorizontalTimeline activities={activity} viewerRole="workshop" />
      </Card>
    </main>
  );
}
