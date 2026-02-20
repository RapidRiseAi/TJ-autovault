import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, Car, CheckCircle2, UserRound } from 'lucide-react';
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

type InvoiceRow = {
  id: string;
  total_cents: number | null;
  payment_status: string | null;
  invoice_number?: string | null;
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
    unpaidInvoicesResult,
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
      .select('id,total_cents,payment_status,invoice_number')
      .eq('workshop_account_id', workshopId)
      .neq('payment_status', 'paid')
      .order('total_cents', { ascending: false })
      .limit(200),
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
  const unpaidInvoices = (unpaidInvoicesResult.data ?? []) as InvoiceRow[];
  const invoiceBreakdown = unpaidInvoices
    .map((invoice) => ({
      id: invoice.id,
      reference: invoice.invoice_number || `#${invoice.id.slice(0, 8).toUpperCase()}`,
      outstandingCents: Math.max(invoice.total_cents ?? 0, 0)
    }))
    .filter((invoice) => invoice.outstandingCents > 0);
  const totalOutstandingCents = invoiceBreakdown.reduce((sum, invoice) => sum + invoice.outstandingCents, 0);
  const unpaidInvoiceCount = invoiceBreakdown.length;
  const redScale = ['#ef4444', '#dc2626', '#b91c1c', '#991b1b', '#7f1d1d'];
  const outstandingSegments = invoiceBreakdown.map((invoice, index) => ({
    value: invoice.outstandingCents,
    tone: 'negative' as const,
    color: redScale[index % redScale.length]
  }));
  const topOutstandingInvoices = [...invoiceBreakdown]
    .sort((a, b) => b.outstandingCents - a.outstandingCents)
    .slice(0, 3);

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
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Outstanding invoices</p>
            <p className="text-3xl font-bold text-neutral-900">
              {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(totalOutstandingCents / 100)}
            </p>
            <p className="text-sm text-gray-500">{unpaidInvoiceCount > 0 ? `${unpaidInvoiceCount} unpaid invoices` : 'No outstanding invoices'}</p>
            {topOutstandingInvoices.length ? (
              <ul className="space-y-1 pt-1 text-xs text-gray-500">
                {topOutstandingInvoices.map((invoice) => (
                  <li key={invoice.id} className="truncate">
                    Invoice {invoice.reference} • {new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(invoice.outstandingCents / 100)}
                  </li>
                ))}
                {unpaidInvoiceCount > 3 ? <li>+{unpaidInvoiceCount - 3} more</li> : null}
              </ul>
            ) : null}
          </div>
          {unpaidInvoiceCount > 0 && totalOutstandingCents > 0 ? (
            <SegmentRing
              size={102}
              centerLabel={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(totalOutstandingCents / 100)}
              subLabel="Total outstanding"
              segments={outstandingSegments}
              total={totalOutstandingCents}
            />
          ) : (
            <div className="flex h-[102px] w-[102px] flex-col items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]">Paid</p>
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
                <div key={customer.id} className="flex h-full items-center justify-between gap-3 border-b border-neutral-200/80 py-2.5 last:border-b-0">
                  <div className="flex min-w-0 items-center gap-2.5">
                    {avatar ? (
                      <img src={avatar} alt={customerName} className="h-9 w-9 rounded-full border border-black/10 object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100 text-[11px] font-semibold text-black/80">{initials(customerName)}</div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold leading-tight text-brand-black">{customerName}</p>
                      <p className="truncate text-xs leading-tight text-gray-400">{businessName}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <p className="text-xs text-gray-500">{formatDate(customer.created_at)}</p>
                    <Button asChild size="sm" className="min-h-0 min-w-14 border border-brand-red/30 px-3 py-1 text-xs shadow-none">
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
