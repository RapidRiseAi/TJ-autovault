import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { buildTimelineActorLabel } from '@/lib/timeline';
import { buildActivityStream } from '@/lib/activity-stream';
import { HorizontalTimeline } from '@/components/customer/vehicle-activity';

export default async function WorkshopTimelinePage({
  searchParams
}: {
  searchParams: Promise<{ customerId?: string; vehicleId?: string }>;
}) {
  const { customerId, vehicleId } = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  ) {
    redirect('/customer/dashboard');
  }

  const workshopId = profile.workshop_account_id;

  const normalizedCustomerId = customerId?.trim() || '';
  const normalizedVehicleId = vehicleId?.trim() || '';

  let timelineQuery = supabase
    .from('vehicle_timeline_events')
    .select('*')
    .eq('workshop_account_id', workshopId);

  let documentsQuery = supabase
    .from('vehicle_documents')
    .select(
      'id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance,invoice_id,quote_id,customer_account_id,vehicle_id'
    )
    .eq('workshop_account_id', workshopId);

  if (normalizedCustomerId) {
    timelineQuery = timelineQuery.eq(
      'customer_account_id',
      normalizedCustomerId
    );
    documentsQuery = documentsQuery.eq(
      'customer_account_id',
      normalizedCustomerId
    );
  }
  if (normalizedVehicleId) {
    timelineQuery = timelineQuery.eq('vehicle_id', normalizedVehicleId);
    documentsQuery = documentsQuery.eq('vehicle_id', normalizedVehicleId);
  }

  const [
    { data: timelineRows, error: timelineError },
    { data: documents, error: documentsError },
    { data: customers },
    { data: vehicles }
  ] = await Promise.all([
    timelineQuery.order('created_at', { ascending: false }).limit(500),
    documentsQuery.order('created_at', { ascending: false }).limit(500),
    supabase
      .from('customer_accounts')
      .select('id,name')
      .eq('workshop_account_id', workshopId)
      .order('name', { ascending: true }),
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,current_customer_account_id')
      .eq('workshop_account_id', workshopId)
      .order('registration_number', { ascending: true })
  ]);

  if (timelineError || documentsError) {
    return (
      <main>
        <Card>
          <h1 className="text-xl font-semibold">
            Unable to load workshop timeline
          </h1>
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
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Workshop timeline</h1>
            <p className="text-sm text-gray-600">
              Unified timeline across all vehicles, actions, and documents.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild size="sm" variant="outline">
              <Link href="/workshop/dashboard">Back to dashboard</Link>
            </Button>
          </div>
        </div>
        <form className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-xs text-gray-600">
            Customer
            <select
              name="customerId"
              defaultValue={normalizedCustomerId}
              className="mt-1 h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
            >
              <option value="">All customers</option>
              {(customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-600">
            Vehicle
            <select
              name="vehicleId"
              defaultValue={normalizedVehicleId}
              className="mt-1 h-10 w-full rounded-lg border border-black/15 bg-white px-3 text-sm"
            >
              <option value="">All vehicles</option>
              {(vehicles ?? []).map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>
                  {vehicle.registration_number} · {vehicle.make ?? '-'}{' '}
                  {vehicle.model ?? '-'}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-2 sm:col-span-2">
            <Button type="submit" size="sm">
              Apply filters
            </Button>
            {normalizedCustomerId || normalizedVehicleId ? (
              <Button asChild type="button" variant="outline" size="sm">
                <Link href="/workshop/timeline">Reset</Link>
              </Button>
            ) : null}
          </div>
        </form>
      </Card>

      <Card>
        <HorizontalTimeline activities={activity} viewerRole="workshop" />
      </Card>
    </main>
  );
}
