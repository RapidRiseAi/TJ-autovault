import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { buildActivityStream } from '@/lib/activity-stream';
import { HorizontalTimeline } from '@/components/customer/vehicle-activity';

export default async function WorkshopCustomerTimelinePage({
  params
}: {
  params: Promise<{ customerAccountId: string }>;
}) {
  const { customerAccountId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  ) {
    redirect('/customer/dashboard');
  }

  const workshopId = profile.workshop_account_id;

  const [{ data: customer }, { data: timeline }, { data: documents }] =
    await Promise.all([
      supabase
        .from('customer_accounts')
        .select('id,name')
        .eq('id', customerAccountId)
        .eq('workshop_account_id', workshopId)
        .maybeSingle(),
      supabase
        .from('vehicle_timeline_events')
        .select('*')
        .eq('customer_account_id', customerAccountId)
        .eq('workshop_account_id', workshopId)
        .order('created_at', { ascending: false })
        .limit(800),
      supabase
        .from('vehicle_documents')
        .select(
          'id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance,invoice_id,quote_id'
        )
        .eq('customer_account_id', customerAccountId)
        .eq('workshop_account_id', workshopId)
        .order('created_at', { ascending: false })
        .limit(800)
    ]);

  if (!customer) notFound();

  const timelineRows = await Promise.all(
    (timeline ?? []).map(async (event) => ({
      ...event,
      actorLabel: await buildTimelineActorLabel(supabase as never, event)
    }))
  );

  const activity = buildActivityStream(timelineRows, documents ?? []);

  return (
    <main className="space-y-4">
      <PageHeader
        title={`${customer.name} timeline`}
        subtitle="Unified customer activity across all linked vehicles"
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href={`/workshop/customers/${customer.id}`}>
              Back to customer
            </Link>
          </Button>
        }
      />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Activity</h2>
        <HorizontalTimeline activities={activity} viewerRole="workshop" />
      </Card>
    </main>
  );
}
