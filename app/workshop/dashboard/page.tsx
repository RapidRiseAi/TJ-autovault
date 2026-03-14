import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { AlertTriangle, Car, CheckCircle2, UserRound } from 'lucide-react';
import { HeroHeader } from '@/components/layout/hero-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { SectionCard } from '@/components/ui/section-card';
import { DashboardListsClient } from '@/components/workshop/dashboard-lists-client';
import { PersistedCollapsiblePanel } from '@/components/workshop/persisted-collapsible-panel';
import { SegmentRing } from '@/components/ui/segment-ring';
import { SendMessageModal } from '@/components/messages/send-message-modal';
import { resolvePostLoginPath } from '@/lib/auth/role-redirect';

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
  vehicle_id: string | null;
  total_cents: number | null;
  payment_status: string | null;
  invoice_number?: string | null;
};


function getSouthAfricaDateIso() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Johannesburg',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = parts.find((part) => part.type === 'month')?.value ?? '01';
  const day = parts.find((part) => part.type === 'day')?.value ?? '01';
  return `${year}-${month}-${day}`;
}

async function submitTechnicianClockIn(formData: FormData) {
  'use server';
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || profile.role !== 'technician') {
    redirect('/workshop/dashboard');
  }

  const answer = (formData.get('clockedIn')?.toString() ?? '').trim();
  if (answer !== 'yes' && answer !== 'no') redirect('/workshop/dashboard');

  const workedOn = getSouthAfricaDateIso();
  await supabase.from('technician_attendance').upsert(
    {
      workshop_account_id: profile.workshop_account_id,
      technician_profile_id: profile.id,
      worked_on: workedOn,
      clocked_in: answer === 'yes',
      created_by: profile.id
    },
    { onConflict: 'technician_profile_id,worked_on' }
  );

  revalidatePath('/workshop/dashboard');
  revalidatePath('/workshop/technicians');
  redirect('/workshop/dashboard?clocked=1');
}

export default async function WorkshopDashboardPage({ searchParams }: { searchParams?: Promise<{ clocked?: string }> }) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', user.id)
    .single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    redirect(resolvePostLoginPath({ role: profile?.role, email: user.email }));
  }

  const workshopId = profile.workshop_account_id;
  const todaySa = getSouthAfricaDateIso();
  const { data: todaysAttendance } = profile.role === 'technician'
    ? await supabase
        .from('technician_attendance')
        .select('id,clocked_in')
        .eq('workshop_account_id', workshopId)
        .eq('technician_profile_id', profile.id)
        .eq('worked_on', todaySa)
        .maybeSingle()
    : { data: null };
  const params = searchParams ? await searchParams : undefined;
  const [
    { count: vehicles },
    { count: openRequests },
    unpaidInvoicesResult,
    customerResult,
    { data: pendingVehicles },
    { data: customerVehicles }
  ] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase
      .from('work_requests')
      .select('id', { count: 'exact', head: true })
      .eq('workshop_account_id', workshopId)
      .in('status', ['requested', 'waiting_for_deposit', 'waiting_for_parts', 'scheduled', 'in_progress']),
    supabase
      .from('invoices')
      .select('id,vehicle_id,total_cents,payment_status,invoice_number')
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
      .limit(8),
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,status,current_customer_account_id')
      .eq('workshop_account_id', workshopId)
      .order('registration_number', { ascending: true })
      .limit(200)
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
      <div className="hidden md:block">
        <HeroHeader
          title="Workshop dashboard"
          subtitle="Track customers, active jobs, and billing from one polished workspace."
          actions={
            <div className="flex flex-wrap gap-2">
              <SendMessageModal
                vehicles={(customerVehicles ?? []).map((vehicle) => ({ id: vehicle.id, registration_number: vehicle.registration_number }))}
                customers={customerRows.map((customer) => ({ id: customer.id, name: customer.name }))}
              />
              <Button asChild variant="secondary" className="shadow-sm hover:-translate-y-px hover:shadow-md">
                <Link href="/workshop/management">Open management center</Link>
              </Button>
              <Button asChild className="shadow-sm hover:-translate-y-px hover:shadow-md">
                <Link href="/workshop/work-requests">Open work request board</Link>
              </Button>
            </div>
          }
        />
      </div>

      {profile.role === 'technician' && !todaysAttendance ? (
        <SectionCard className="rounded-3xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-base font-semibold text-amber-900">Clock in for today</h2>
          <p className="mt-1 text-sm text-amber-800">Are you clocking in for work today? This updates days worked and technician pay owed.</p>
          <form action={submitTechnicianClockIn} className="mt-3 flex gap-2">
            <button type="submit" name="clockedIn" value="yes" className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">Yes, clock me in</button>
            <button type="submit" name="clockedIn" value="no" className="rounded-xl border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900">No, not today</button>
          </form>
        </SectionCard>
      ) : null}

      {params?.clocked === '1' ? (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Clock-in response saved for today.</p>
      ) : null}

      <section className="grid grid-cols-3 gap-2.5 md:hidden">
        <article className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_10px_20px_rgba(17,17,17,0.06)]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
              <UserRound className="h-4 w-4" />
            </span>
            <div>
              <p className="text-base font-bold leading-none text-neutral-900">{customerRows.length}</p>
              <p className="text-[11px] text-gray-500">Customers</p>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-neutral-200 bg-white p-3 shadow-[0_10px_20px_rgba(17,17,17,0.06)]">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-neutral-900">
              <Car className="h-4 w-4" />
            </span>
            <div>
              <p className="text-base font-bold leading-none text-neutral-900">{totalVehicles}</p>
              <p className="text-[11px] text-gray-500">Vehicles</p>
            </div>
          </div>
        </article>

        <article className={`rounded-2xl border bg-white p-3 shadow-[0_10px_20px_rgba(17,17,17,0.06)] ${openRequestCount > 0 ? 'border-amber-200' : 'border-neutral-200'}`}>
          <div className="flex items-center gap-2.5">
            <span className={`inline-flex h-8 w-8 items-center justify-center rounded-full ${openRequestCount > 0 ? 'bg-amber-100 text-amber-700' : 'bg-neutral-100 text-neutral-500'}`}>
              <AlertTriangle className="h-4 w-4" />
            </span>
            <div>
              <p className="text-base font-bold leading-none text-neutral-900">{openRequestCount}</p>
              <p className="text-[11px] text-gray-500">Open requests</p>
            </div>
          </div>
        </article>

        <article className="col-span-3 rounded-2xl border border-neutral-200 bg-white p-3.5 shadow-[0_10px_20px_rgba(17,17,17,0.06)]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-gray-500">Outstanding invoices</p>
          <div className="mt-2 flex items-center justify-between gap-2.5">
            {unpaidInvoiceCount > 0 && totalOutstandingCents > 0 ? (
              <SegmentRing
                size={70}
                centerLabel={`${unpaidInvoiceCount}`}
                subLabel="unpaid"
                segments={outstandingSegments}
                total={totalOutstandingCents}
              />
            ) : (
              <div className="flex h-[74px] w-[74px] flex-col items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" />
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em]">Paid</p>
              </div>
            )}
            <div className="min-w-0 text-right">
              <p className="text-base font-bold leading-none text-neutral-900">{new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(totalOutstandingCents / 100)}</p>
              <p className="mt-1 text-[11px] text-gray-500">Amount unpaid</p>
            </div>
          </div>
        </article>
      </section>

      <section className="hidden gap-3 md:grid md:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,17,17,0.08)]">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Customers & vehicles</p>
          <div className="grid grid-cols-2 divide-x divide-neutral-200">
            <div className="pr-4">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-900"><UserRound className="h-5 w-5" /></div>
              <p className="text-2xl font-bold text-neutral-900">{customerRows.length}</p>
              <p className="text-[11px] text-gray-500">Customers</p>
            </div>
            <div className="pl-4">
              <div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-neutral-900"><Car className="h-5 w-5" /></div>
              <p className="text-2xl font-bold text-neutral-900">{totalVehicles}</p>
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
          <p className="mt-3 text-2xl font-bold text-neutral-900">{openRequestCount}</p>
          <p className="text-sm text-gray-500">{openRequestCount > 0 ? 'Needs attention' : 'No open requests'}</p>
          <Button asChild size="sm" variant={openRequestCount > 0 ? 'primary' : 'outline'} className="mt-4">
            <Link href="/workshop/work-requests">View requests</Link>
          </Button>
        </article>

        <article className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,17,17,0.08)]">
          <div className="space-y-2">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">Outstanding invoices</p>
            <p className="text-2xl font-bold text-neutral-900">
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
              size={86}
              centerLabel={new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(totalOutstandingCents / 100)}
              subLabel={`${unpaidInvoiceCount} unpaid`}
              segments={outstandingSegments}
              total={totalOutstandingCents}
            />
          ) : (
            <div className="flex h-[86px] w-[86px] flex-col items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
              <CheckCircle2 className="h-7 w-7" />
              <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.16em]">Paid</p>
            </div>
          )}
        </article>
      </section>

      <DashboardListsClient
        customerRows={customerRows}
        customerVehicles={customerVehicles ?? []}
        unpaidInvoices={unpaidInvoices}
        customersError={customersError}
      />

      <PersistedCollapsiblePanel title="Pending verification" id="pending-verification">
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
      </PersistedCollapsiblePanel>
    </main>
  );
}
