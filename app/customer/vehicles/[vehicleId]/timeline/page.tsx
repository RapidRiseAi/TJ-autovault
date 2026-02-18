import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle } from '@/lib/routes';
import { buildActivityStream, HorizontalTimeline } from '@/components/customer/vehicle-activity';
import { PageHeader } from '@/components/layout/page-header';

export default async function VehicleTimelinePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
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
    .select('id,registration_number')
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

  const [{ data: timeline }, { data: documents }] = await Promise.all([
    supabase
      .from('vehicle_timeline_events')
      .select('*')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
      .limit(300),
    supabase
      .from('vehicle_documents')
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
      .limit(300)
  ]);

  const timelineRows = await Promise.all(
    (timeline ?? []).map(async (event) => ({
      ...event,
      actorLabel: await buildTimelineActorLabel(supabase as never, event)
    }))
  );
  const activity = buildActivityStream(timelineRows, documents ?? []);

  return (
    <main className="space-y-4">
      <PageHeader title="Full timeline" subtitle={`${vehicle.registration_number} · Unified activity stream`} actions={<Button asChild variant="secondary" size="sm"><Link href={customerVehicle(vehicleId)}>Back to vehicle</Link></Button>} />

      <Card>
        <h2 className="mb-3 text-lg font-semibold">Activity</h2>
        <HorizontalTimeline activities={activity} />
      </Card>
    </main>
  );
}
