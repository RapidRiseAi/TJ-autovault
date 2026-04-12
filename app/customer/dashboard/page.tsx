import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentRing } from '@/components/ui/segment-ring';
import { HeroHeader } from '@/components/layout/hero-header';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle, customerVehicleNew } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { SendMessageModal } from '@/components/messages/send-message-modal';
import { CustomerOnboardingHub } from '@/components/customer/customer-onboarding-hub';
import { getCustomerOnboardingChecklist } from '@/lib/customer/onboarding-checklist';
import { filterVisibleCustomerVehicles, getTemporaryVehicleLimitByTier } from '@/lib/customer/temporary-vehicles';

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2
  }).format((cents ?? 0) / 100);
}

function OverviewTile({
  title,
  value,
  detail,
  secondary,
  href,
  ring
}: {
  title: string;
  value: string;
  detail?: string;
  secondary?: string;
  href?: string;
  ring?: ReactNode;
}) {
  const tile = (
    <div className="h-full rounded-2xl border border-black/10 bg-white/95 p-2.5 shadow-[0_6px_20px_rgba(17,17,17,0.06)] sm:p-3 sm:shadow-[0_6px_24px_rgba(17,17,17,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
        {title}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-semibold text-black sm:text-lg">{value}</p>
          {detail ? <p className="text-xs text-gray-600">{detail}</p> : null}
          {secondary ? <p className="text-[11px] text-gray-500">{secondary}</p> : null}
        </div>
        {ring ? <div className="shrink-0">{ring}</div> : null}
      </div>
    </div>
  );

  if (!href) return tile;
  return (
    <Link href={href} className="block h-full transition hover:-translate-y-px">
      {tile}
    </Link>
  );
}

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const customerContext = await getCustomerContextOrCreate();
  if (!customerContext) redirect('/customer/profile-required');

  const customerAccountId = customerContext.customer_account.id;

  const onboardingChecklist = await getCustomerOnboardingChecklist({
    supabase,
    userId: user.id,
    customerAccountId
  });

  const [
    { data: account },
    { data: vehicles },
    { data: invoices },
    { data: pendingQuotes },
    { data: openRequests },
    { data: notifications },
    { count: unreadCount }
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select('vehicle_limit,tier,temporary_vehicle_limit')
      .eq('id', customerAccountId)
      .single(),
    supabase
      .from('vehicles')
      .select(
        'id,registration_number,make,model,year,status,primary_image_path,odometer_km,is_temporary,archived_at'
      )
      .eq('current_customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id,total_cents,payment_status,vehicle_id,due_date')
      .eq('customer_account_id', customerAccountId),
    supabase
      .from('quotes')
      .select('id,total_cents,status,vehicle_id')
      .eq('customer_account_id', customerAccountId)
      .in('status', ['sent', 'pending']),
    supabase
      .from('work_requests')
      .select('id,priority,status,vehicle_id')
      .eq('customer_account_id', customerAccountId)
      .not('status', 'in', '(completed,cancelled)'),
    supabase
      .from('notifications')
      .select('id,title,created_at,is_read')
      .eq('to_customer_account_id', customerAccountId)
      .eq('is_read', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('to_customer_account_id', customerAccountId)
      .eq('is_read', false)
      .is('deleted_at', null)
  ]);

  const temporaryLimit = Number(
    account?.temporary_vehicle_limit ?? getTemporaryVehicleLimitByTier(account?.tier)
  );
  const visibleVehicles = filterVisibleCustomerVehicles(vehicles ?? [], temporaryLimit);
  const activeTemporaryVehiclesCount = (vehicles ?? []).filter(
    (vehicle) => vehicle.is_temporary && !vehicle.archived_at
  ).length;
  const visibleVehicleIds = new Set(visibleVehicles.map((vehicle) => vehicle.id));
  const usedVehicles = visibleVehicles.length;
  const allowedVehicles = account?.vehicle_limit ?? 1;

  const allInvoices = (invoices ?? []).filter((invoice) =>
    invoice.vehicle_id ? visibleVehicleIds.has(invoice.vehicle_id) : true
  );
  const outstandingInvoices = allInvoices.filter(
    (invoice) => invoice.payment_status !== 'paid'
  );
  const paidInvoices = allInvoices.filter((invoice) => invoice.payment_status === 'paid');

  const outstandingInvoiceCount = outstandingInvoices.length;
  const outstandingInvoiceTotalCents = outstandingInvoices.reduce(
    (sum, invoice) => sum + (invoice.total_cents ?? 0),
    0
  );
  const totalSpentCents = paidInvoices.reduce(
    (sum, invoice) => sum + (invoice.total_cents ?? 0),
    0
  );

  const visibleRequests = (openRequests ?? []).filter((request) =>
    request.vehicle_id ? visibleVehicleIds.has(request.vehicle_id) : true
  );
  const visiblePendingQuotes = (pendingQuotes ?? []).filter((quote) =>
    quote.vehicle_id ? visibleVehicleIds.has(quote.vehicle_id) : true
  );

  const openRequestCount = visibleRequests.length;
  const urgentRequestCount = visibleRequests.filter((request) =>
    ['high', 'urgent'].includes((request.priority ?? '').toLowerCase())
  ).length;

  const pendingQuoteCount = visiblePendingQuotes.length;
  const pendingQuoteTotalCents = visiblePendingQuotes.reduce(
    (sum, quote) => sum + (quote.total_cents ?? 0),
    0
  );

  const outstandingByVehicle = new Map<string, number>();
  const requestByVehicle = new Map<string, number>();
  const spentByVehicle = new Map<string, number>();

  outstandingInvoices.forEach((invoice) => {
    if (!invoice.vehicle_id) return;
    outstandingByVehicle.set(
      invoice.vehicle_id,
      (outstandingByVehicle.get(invoice.vehicle_id) ?? 0) + (invoice.total_cents ?? 0)
    );
  });

  paidInvoices.forEach((invoice) => {
    if (!invoice.vehicle_id) return;
    spentByVehicle.set(
      invoice.vehicle_id,
      (spentByVehicle.get(invoice.vehicle_id) ?? 0) + (invoice.total_cents ?? 0)
    );
  });

  visibleRequests.forEach((request) => {
    if (!request.vehicle_id) return;
    requestByVehicle.set(
      request.vehicle_id,
      (requestByVehicle.get(request.vehicle_id) ?? 0) + 1
    );
  });

  const vehicleStatusTone = (status: string | null) => {
    const normalized = (status ?? 'pending').toLowerCase();
    if (normalized.includes('active') || normalized.includes('ready')) {
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    }
    if (normalized.includes('pending') || normalized.includes('due')) {
      return 'border-red-200 bg-red-50 text-red-700';
    }
    return 'border-black/10 bg-gray-50 text-gray-700';
  };

  return (
    <main className="space-y-4 pb-4">
      <HeroHeader
        title="Customer dashboard"
        subtitle="Track active work, invoices, and your vehicles at a glance."
        actions={
          <div className="flex flex-wrap gap-2">
            <SendMessageModal
              vehicles={visibleVehicles.map((vehicle) => ({ id: vehicle.id, registration_number: vehicle.registration_number }))}
            />
            <Button asChild>
              <Link href={customerVehicleNew()}>Add vehicle</Link>
            </Button>
          </div>
        }
      />

      <CustomerOnboardingHub
        userId={user.id}
        profileTasks={onboardingChecklist.profileTasks}
        profileCompletionPercent={onboardingChecklist.profileCompletionPercent}
        completedRequiredProfileTasks={onboardingChecklist.completedRequiredProfileTasks}
        totalRequiredProfileTasks={onboardingChecklist.totalRequiredProfileTasks}
      />

      <section className="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
        <OverviewTile
          title="Vehicle slots"
          value={`${usedVehicles}/${allowedVehicles} used`}
          detail={`${Math.max(allowedVehicles - usedVehicles, 0)} available`}
          secondary={`Temporary active ${activeTemporaryVehiclesCount}/${temporaryLimit}`}
          ring={
            <>
              <div className="sm:hidden">
                <SegmentRing
                  size={62}
                  centerLabel={`${usedVehicles}/${allowedVehicles}`}
                  subLabel="Slots"
                  total={allowedVehicles}
                  segments={[{ value: usedVehicles, tone: 'neutral' }]}
                />
              </div>
              <div className="hidden sm:block">
                <SegmentRing
                  size={82}
                  centerLabel={`${usedVehicles}/${allowedVehicles}`}
                  subLabel="Slots"
                  total={allowedVehicles}
                  segments={[{ value: usedVehicles, tone: 'neutral' }]}
                />
              </div>
            </>
          }
        />
        <OverviewTile
          title="Outstanding invoices"
          value={`${outstandingInvoiceCount} unpaid`}
          detail={formatMoney(outstandingInvoiceTotalCents)}
          secondary={`Total spent ${formatMoney(totalSpentCents)}`}
          href="/customer/invoices?status=unpaid"
        />
        <OverviewTile
          title="Open requests"
          value={`${openRequestCount} open`}
          detail={`${urgentRequestCount} urgent`}
          href="/customer/notifications"
        />
        <OverviewTile
          title="Pending quote decisions"
          value={`${pendingQuoteCount} pending`}
          detail={formatMoney(pendingQuoteTotalCents)}
          href="/customer/notifications"
        />
      </section>

      {outstandingInvoiceCount > 0 ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-white px-4 py-2.5 shadow-[0_8px_28px_rgba(220,38,38,0.14)]">
          <p className="text-sm font-medium text-red-900">
            Payment required: You have outstanding invoices.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700">
            <Link href="/customer/invoices?status=unpaid">View invoices</Link>
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="hidden gap-3 sm:grid md:grid-cols-2 2xl:grid-cols-3">
          {visibleVehicles.length === 0 ? (
            <Card className="rounded-3xl border-dashed">
              <p className="text-sm text-gray-600">
                No vehicles yet. Add your first vehicle to start tracking service history.
              </p>
            </Card>
          ) : null}
          {visibleVehicles.map((vehicle) => (
            <Card key={vehicle.id} className="rounded-2xl border border-black/10 p-3 shadow-[0_8px_26px_rgba(17,17,17,0.06)]">
              <div className="sm:hidden">
                <div className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
                  {vehicle.primary_image_path ? (
                    <img
                      src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                      alt={`${vehicle.registration_number} vehicle`}
                      className="h-28 w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="h-28 rounded-xl bg-gray-100" />
                  )}
                  <div className="min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h2 className="truncate text-[2rem] font-bold leading-[0.95] tracking-tight">{vehicle.registration_number}</h2>
                        <p className="truncate text-sm text-gray-600">
                          {vehicle.make ?? 'Unknown'} {vehicle.model ?? ''}{' '}
                          {vehicle.year ? `(${vehicle.year})` : ''}
                        </p>
                      </div>
                      <Button asChild variant="secondary" size="sm" className="shrink-0 px-3">
                        <Link href={customerVehicle(vehicle.id)}>Open</Link>
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-1.5 text-[11px]">
                      <span className={`rounded-full border px-2 py-1 font-semibold uppercase ${vehicleStatusTone(vehicle.status)}`}>
                        {vehicle.status ?? 'pending'}
                      </span>
                      <span className="rounded-full border border-black/10 bg-gray-50 px-2 py-1 text-gray-700">
                        Outstanding {formatMoney(outstandingByVehicle.get(vehicle.id) ?? 0)}
                      </span>
                      <span className="rounded-full border border-black/10 bg-gray-50 px-2 py-1 text-gray-700">
                        Open requests {requestByVehicle.get(vehicle.id) ?? 0}
                      </span>
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">
                        Total spent {formatMoney(spentByVehicle.get(vehicle.id) ?? 0)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="hidden space-y-3 sm:block">
                {vehicle.primary_image_path ? (
                  <img
                    src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                    alt={`${vehicle.registration_number} vehicle`}
                    className="h-32 w-full rounded-xl object-cover"
                  />
                ) : (
                  <div className="h-32 rounded-xl bg-gray-100" />
                )}
                <div>
                  <h2 className="text-lg font-semibold">{vehicle.registration_number}</h2>
                  <p className="text-sm text-gray-600">
                    {vehicle.make ?? 'Unknown'} {vehicle.model ?? ''}{' '}
                    {vehicle.year ? `(${vehicle.year})` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${vehicleStatusTone(vehicle.status)}`}
                  >
                    {vehicle.status ?? 'pending'}
                  </span>
                  <span className="rounded-full border border-black/10 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700">
                    Outstanding {formatMoney(outstandingByVehicle.get(vehicle.id) ?? 0)}
                  </span>
                  <span className="rounded-full border border-black/10 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700">
                    Open requests {requestByVehicle.get(vehicle.id) ?? 0}
                  </span>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] text-emerald-700">
                    Total spent {formatMoney(spentByVehicle.get(vehicle.id) ?? 0)}
                  </span>
                </div>
                <Button asChild variant="secondary" size="sm" className="w-full">
                  <Link href={customerVehicle(vehicle.id)}>Open vehicle</Link>
                </Button>
              </div>
            </Card>
          ))}
        </section>

        {(unreadCount ?? 0) > 0 ? (
          <Card className="h-fit rounded-2xl p-4">
            <h3 className="text-base font-semibold">Unread notifications</h3>
            <div className="mt-3 space-y-2">
              {(notifications ?? []).map((notification) => (
                <div key={notification.id} className="rounded-xl border border-black/10 p-3">
                  <p
                    className={`text-sm ${notification.is_read ? 'text-gray-600' : 'font-semibold text-black'}`}
                  >
                    {notification.title}
                  </p>
                  <p className="text-xs text-gray-500">
                    {notification.created_at
                      ? new Date(notification.created_at).toLocaleString()
                      : 'Unknown date'}
                  </p>
                </div>
              ))}
            </div>
            <Button asChild variant="secondary" size="sm" className="mt-3 w-full">
              <Link href="/customer/notifications">View all notifications</Link>
            </Button>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
