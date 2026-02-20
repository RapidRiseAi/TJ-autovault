import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Car, CircleDollarSign, UserRound } from 'lucide-react';
import { HeroHeader } from '@/components/layout/hero-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { SectionCard } from '@/components/ui/section-card';
import { SegmentRing } from '@/components/ui/segment-ring';
import { EmptyState } from '@/components/ui/empty-state';

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
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    redirect('/customer/dashboard');
  }

  const workshopId = profile.workshop_account_id;
  const [
    { count: vehicles },
    { count: openRequests },
    { count: unpaidInvoices },
    { count: totalInvoices },
    customerResult,
    { data: pendingVehicles }
  ] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase
      .from('work_requests')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId)
      .in('status', ['requested', 'waiting_for_deposit', 'waiting_for_parts', 'scheduled', 'in_progress']),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId)
      .neq('payment_status', 'paid'),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase
      .from('customer_accounts')
      .select('id,name,created_at,customer_users(profiles(display_name,full_name,avatar_url))')
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase
      .from('vehicles')
      .select('id,registration_number,status')
      .eq('workshop_account_id', workshopId)
      .ilike('status', '%pending%')
      .limit(8)
  ]);

  const customerRows = (customerResult.data ?? []) as CustomerRow[];
  const customersError = customerResult.error;
  const totalVehicles = vehicles ?? 0;
  const openRequestCount = openRequests ?? 0;
  const totalInvoiceCount = totalInvoices ?? 0;
  const unpaidInvoiceCount = unpaidInvoices ?? 0;
  const unpaidPct = totalInvoiceCount > 0 ? Math.round((unpaidInvoiceCount / totalInvoiceCount) * 100) : null;

  return (
    <main className="space-y-7 pb-2">
      <HeroHeader
        title="Workshop dashboard"
        subtitle="Track customers, active jobs, and billing from one polished workspace."
        actions={
          <Button asChild className="shadow-sm hover:-translate-y-px hover:shadow-md">
            <Link href="/workshop/work-requests">Open work request board</Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-3">
        <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,17,17,0.08)]">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Customers & vehicles</p>
          <div className="grid grid-cols-2 divide-x divide-neutral-200">
            <div className="pr-4">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-900"><UserRound className="h-5 w-5" /></div>
              <p className="text-3xl font-bold text-neutral-900">{customerRows.length}</p>
              <p className="text-xs text-gray-500">Customers</p>
            </div>
            <div className="pl-4">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-900"><Car className="h-5 w-5" /></div>
              <p className="text-3xl font-bold text-neutral-900">{totalVehicles}</p>
              <p className="text-xs text-gray-500">Vehicles</p>
            </div>
          </div>
        </article>

        <article
          className={`rounded-2xl border bg-white p-5 shadow-[0_14px_30px_rgba(17,17,17,0.08)] ${
            openRequestCount > 0 ? 'border-amber-200' : 'border-neutral-200'
          }`}
        >
          <div className="flex items-start justify-between">
            <div className={`inline-flex h-10 w-10 items-center justify-center rounded-full ${openRequestCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-500'}`}>
              <AlertTriangle className="h-5 w-5" />
            </div>
            {openRequestCount > 0 ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-700">Needs action</span> : null}
          </div>
          <p className="mt-3 text-3xl font-bold text-neutral-900">{openRequestCount}</p>
          <p className="text-sm text-gray-500">{openRequestCount > 0 ? 'Needs attention' : 'No open requests'}</p>
          <Button asChild size="sm" variant={openRequestCount > 0 ? 'primary' : 'outline'} className="mt-4">
            <Link href="/workshop/work-requests">View requests</Link>
          </Button>
        </article>

        <article className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,17,17,0.08)]">
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Unpaid invoices</p>
            <p className="text-3xl font-bold text-neutral-900">{unpaidInvoiceCount}</p>
            <p className="text-sm text-gray-500">Outstanding of {totalInvoiceCount} total</p>
          </div>
          {unpaidPct !== null && totalInvoiceCount > 0 ? (
            <SegmentRing
              size={96}
              centerLabel={`${unpaidPct}%`}
              subLabel="Outstanding"
              total={Math.max(totalInvoiceCount, 1)}
              segments={[{ value: unpaidInvoiceCount, tone: 'negative' }]}
            />
          ) : (
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
              <CircleDollarSign className="h-6 w-6" />
            </div>
          )}
        </article>
      </section>

      <SectionCard>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-brand-black">Customers</h2>
          <Button asChild size="sm" variant="secondary">
            <Link href="/workshop/customers">View all</Link>
          </Button>
        </div>
        {customersError ? (
          <EmptyState
            title="Unable to load customers"
            description="Please refresh and try again."
          />
        ) : null}
        {!customersError ? (
          <div className="grid gap-3 md:grid-cols-1 xl:grid-cols-2">
            {customerRows.map((customer) => {
              const profileInfo = customer.customer_users?.[0]?.profiles?.[0];
              const customerName = profileInfo?.full_name || profileInfo?.display_name || customer.name;
              const businessName = customer.name;
              const avatar = profileInfo?.avatar_url;

              return (
                <div
                  key={customer.id}
                  className="flex h-full items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white p-4 transition hover:-translate-y-px hover:shadow-[0_12px_24px_rgba(17,17,17,0.1)]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {avatar ? (
                      <img src={avatar} alt={customerName} className="h-11 w-11 rounded-full border border-black/10 object-cover" />
                    ) : (
                      <div className="flex h-11 w-11 items-center justify-center rounded-full bg-neutral-100 text-xs font-semibold text-black/80">{initials(customerName)}</div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-brand-black">{customerName}</p>
                      <p className="truncate text-xs text-gray-500">{businessName}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-2">
                    <p className="text-xs text-gray-500">{formatDate(customer.created_at)}</p>
                    <Button asChild size="sm" className="min-w-16">
                      <Link href={`/workshop/customers/${customer.id}`}>Open</Link>
                    </Button>
                  </div>
                </div>
              );
            })}
            {!customerRows.length ? (
              <EmptyState title="No customers yet" description="Customers linked to this workshop will appear here." className="xl:col-span-2" />
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard id="pending-verification">
        <h2 className="mb-3 text-lg font-semibold text-brand-black">Pending verification</h2>
        {!pendingVehicles?.length ? (
          <p className="text-sm text-gray-500">No vehicles pending verification.</p>
        ) : (
          <div className="space-y-2">
            {pendingVehicles.map((vehicle) => (
              <div key={vehicle.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-3">
                <div>
                  <p className="text-sm font-semibold">{vehicle.registration_number}</p>
                  <p className="text-xs text-gray-500">{vehicle.status ?? 'pending'}</p>
                </div>
                <div className="flex gap-2">
                  <VerifyVehicleButton vehicleId={vehicle.id} />
                  <Button asChild size="sm" variant="secondary">
                    <Link href={`/workshop/vehicles/${vehicle.id}`}>Open vehicle</Link>
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
