import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Car, UserRound } from 'lucide-react';
import { HeroHeader } from '@/components/layout/hero-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { SectionCard } from '@/components/ui/section-card';
import { SegmentRing } from '@/components/ui/segment-ring';
import { MetricCard } from '@/components/workshop/metric-card';

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  customer_users?: Array<{
    profiles?: Array<{
      display_name: string | null;
      full_name: string | null;
      avatar_url: string | null;
    }>;
  }>;
};

function initials(name: string) {
  return (
    name
      .split(' ')
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'CU'
  );
}

function formatDate(value: string) {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export default async function WorkshopDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();
  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  )
    redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [
    { count: vehicles },
    { count: openRequests },
    { count: unpaidInvoices },
    { count: pendingQuotes },
    customerResult,
    { data: pendingVehicles }
  ] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId),
    supabase
      .from('work_requests')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId)
      .in('status', [
        'requested',
        'waiting_for_deposit',
        'waiting_for_parts',
        'scheduled',
        'in_progress'
      ]),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId)
      .neq('payment_status', 'paid'),
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId)
      .in('status', ['sent', 'pending']),
    supabase
      .from('customer_accounts')
      .select(
        'id,name,created_at,customer_users(profiles(display_name,full_name,avatar_url))'
      )
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('vehicles')
      .select('id,registration_number,status,primary_image_path')
      .eq('workshop_account_id', workshopId)
      .ilike('status', '%pending%')
      .limit(8)
  ]);

  const customerRows = (customerResult.data ?? []) as CustomerRow[];
  const customersError = customerResult.error;
  const totalVehicles = vehicles ?? 0;
  const pendingVerificationCount = pendingVehicles?.length ?? 0;
  const openRequestCount = openRequests ?? 0;

  return (
    <main className="space-y-7 pb-2">
      <HeroHeader
        title="Workshop dashboard"
        subtitle="Track customers, jobs, and payments from one place."
        actions={
          <Button asChild size="sm">
            <Link href="/workshop/work-requests">Open work request board</Link>
          </Button>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <MetricCard
          label="Customers & Vehicles"
          value={
            <div className="grid grid-cols-2 gap-3 pt-1 text-sm">
              <div className="rounded-2xl border border-black/10 bg-stone-50 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <UserRound className="h-3.5 w-3.5" />
                  Customers
                </p>
                <p className="pt-1 text-2xl font-semibold text-black">
                  {customerRows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-black/10 bg-stone-50 px-3 py-2">
                <p className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                  <Car className="h-3.5 w-3.5" />
                  Vehicles
                </p>
                <p className="pt-1 text-2xl font-semibold text-black">
                  {totalVehicles}
                </p>
              </div>
            </div>
          }
          support="Linked accounts and vehicles in service"
        />

        <MetricCard
          label={
            openRequestCount > 0
              ? 'Requests needing attention'
              : 'Open requests'
          }
          value={openRequestCount}
          support={
            openRequestCount > 0
              ? 'Jobs are waiting for workshop action'
              : 'No requests to action'
          }
          className={
            openRequestCount > 0
              ? 'border-amber-200 bg-gradient-to-br from-amber-50/70 via-white to-white shadow-[0_14px_32px_rgba(245,158,11,0.18)]'
              : ''
          }
          visual={
            openRequestCount > 0 ? (
              <AlertTriangle className="h-6 w-6 text-amber-500" />
            ) : undefined
          }
          action={
            <Button asChild size="sm" className="w-full sm:w-auto">
              <Link href="/workshop/work-requests">View requests</Link>
            </Button>
          }
        />

        <MetricCard
          label="Unpaid invoices"
          value={unpaidInvoices ?? 0}
          support="Outstanding billing"
        />

        <MetricCard
          label="Pending quotes"
          value={pendingQuotes ?? 0}
          support="Awaiting customer decision"
        />

        <MetricCard
          label="Vehicles pending verification"
          value={pendingVerificationCount}
          support={`${pendingVerificationCount} of ${Math.max(totalVehicles, 0)} pending`}
          className="xl:col-span-2"
          visual={
            <div className="pt-1">
              <SegmentRing
                size={74}
                centerLabel={`${Math.round((pendingVerificationCount / Math.max(totalVehicles, 1)) * 100)}%`}
                subLabel="Pending"
                total={Math.max(totalVehicles, 1)}
                segments={[
                  { value: pendingVerificationCount, tone: 'negative' }
                ]}
              />
            </div>
          }
          action={
            <Button
              asChild
              size="sm"
              variant="secondary"
              className="w-full sm:w-auto"
            >
              <Link href="#pending-verification">Review pending</Link>
            </Button>
          }
        />
      </section>

      <SectionCard>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand-black">Customers</h2>
          <Button asChild size="sm" variant="secondary">
            <Link href="/workshop/customers">View all</Link>
          </Button>
        </div>
        {customersError ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            Unable to load customers right now. Please refresh and try again.
          </p>
        ) : null}
        {!customersError ? (
          <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-2">
            {customerRows.map((customer) => {
              const profileInfo = customer.customer_users?.[0]?.profiles?.[0];
              const customerName =
                profileInfo?.full_name ||
                profileInfo?.display_name ||
                customer.name;
              const businessName = customer.name;
              const avatar = profileInfo?.avatar_url;

              return (
                <div
                  key={customer.id}
                  className="flex h-full items-center justify-between gap-4 rounded-2xl border border-black/10 bg-white p-4 shadow-[0_10px_24px_rgba(17,17,17,0.07)] transition hover:-translate-y-px hover:shadow-[0_14px_28px_rgba(17,17,17,0.11)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {avatar ? (
                      <img
                        src={avatar}
                        alt={customerName}
                        className="h-11 w-11 rounded-full border border-black/10 object-cover shadow-sm"
                      />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-black/10 bg-white text-xs font-semibold text-black/80 shadow-sm">
                        {initials(customerName)}
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-black">
                        {customerName}
                      </p>
                      <p className="truncate text-xs text-gray-500">
                        {businessName}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="text-xs text-gray-500">
                      {formatDate(customer.created_at)}
                    </p>
                    <Button asChild size="sm" className="min-w-16">
                      <Link href={`/workshop/customers/${customer.id}`}>
                        Open
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
            {!customerRows.length ? (
              <p className="py-4 text-sm text-gray-500">No customers yet.</p>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard id="pending-verification">
        <h2 className="mb-3 text-lg font-semibold text-brand-black">
          Pending verification
        </h2>
        {!pendingVehicles?.length ? (
          <p className="text-sm text-gray-500">
            No vehicles pending verification.
          </p>
        ) : (
          <div className="space-y-2">
            {pendingVehicles.map((vehicle) => (
              <div
                key={vehicle.id}
                className="flex items-center justify-between rounded-2xl border border-black/10 p-3"
              >
                <div>
                  <p className="text-sm font-semibold">
                    {vehicle.registration_number}
                  </p>
                  <p className="text-xs text-gray-500">
                    {vehicle.status ?? 'pending'}
                  </p>
                </div>
                <div className="flex gap-2">
                  <VerifyVehicleButton vehicleId={vehicle.id} />
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/workshop/vehicles/${vehicle.id}`}>
                      Open vehicle
                    </Link>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </main>
  );
}
