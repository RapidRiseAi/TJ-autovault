import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { SegmentRing } from '@/components/ui/segment-ring';
import { HeroHeader } from '@/components/layout/hero-header';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle, customerVehicleNew } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const customerContext = await getCustomerContextOrCreate();
  if (!customerContext) redirect('/customer/profile-required');

  const customerAccount = customerContext.customer_account;

  const [
    { data: account },
    { data: vehicles },
    { data: unpaidInvoices },
    { data: pendingQuotes },
    { data: openRecommendations },
    { data: openRequests },
    { data: notifications },
    { count: unreadCount },
    { data: pendingVerificationVehicles }
  ] = await Promise.all([
    supabase
      .from('customer_accounts')
      .select('tier,vehicle_limit,plan_price_cents')
      .eq('id', customerAccount.id)
      .single(),
    supabase
      .from('vehicles')
      .select(
        'id,registration_number,make,model,year,status,odometer_km,primary_image_path'
      )
      .eq('current_customer_account_id', customerAccount.id)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id,total_cents,vehicle_id')
      .eq('customer_account_id', customerAccount.id)
      .neq('payment_status', 'paid'),
    supabase
      .from('quotes')
      .select('id,total_cents,vehicle_id')
      .eq('customer_account_id', customerAccount.id)
      .eq('status', 'sent'),
    supabase
      .from('recommendations')
      .select('id,severity,vehicle_id')
      .eq('customer_account_id', customerAccount.id)
      .eq('status_text', 'open'),
    supabase
      .from('work_requests')
      .select('id,priority,status,vehicle_id')
      .eq('customer_account_id', customerAccount.id)
      .not('status', 'in', '(completed,cancelled)'),
    supabase
      .from('notifications')
      .select('id,title,created_at,is_read')
      .eq('to_customer_account_id', customerAccount.id)
      .eq('is_read', false)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('to_customer_account_id', customerAccount.id)
      .eq('is_read', false)
      .is('deleted_at', null),
    supabase
      .from('vehicles')
      .select('id')
      .eq('current_customer_account_id', customerAccount.id)
      .eq('status', 'pending_verification')
  ]);

  const usedVehicles = vehicles?.length ?? 0;
  const allowedVehicles = account?.vehicle_limit ?? 1;
  const unpaidInvoiceCount = unpaidInvoices?.length ?? 0;
  const pendingQuoteCount = pendingQuotes?.length ?? 0;
  const openRecommendationCount = openRecommendations?.length ?? 0;
  const openRequestCount = openRequests?.length ?? 0;

  const unpaidOutstandingTotalCents = (unpaidInvoices ?? []).reduce(
    (sum, invoice) => sum + (invoice.total_cents ?? 0),
    0
  );
  const pendingApprovalsTotalCents = (pendingQuotes ?? []).reduce(
    (sum, quote) => sum + (quote.total_cents ?? 0),
    0
  );
  const urgentOpenRequests = (openRequests ?? []).filter((request) =>
    ['high', 'urgent'].includes((request.priority ?? '').toLowerCase())
  ).length;
  const urgentOpenRecommendations = (openRecommendations ?? []).filter(
    (recommendation) =>
      ['high', 'urgent'].includes((recommendation.severity ?? '').toLowerCase())
  ).length;
  const pendingVerificationCount = pendingVerificationVehicles?.length ?? 0;

  const metrics = [
    {
      label: 'Unpaid invoices',
      href: '/customer/notifications',
      count: unpaidInvoiceCount,
      amount: unpaidOutstandingTotalCents,
      countLabel: unpaidInvoiceCount === 1 ? 'invoice' : 'invoices',
      amountLabel: 'outstanding'
    },
    {
      label: 'Pending quotes',
      href: '/customer/notifications',
      count: pendingQuoteCount,
      amount: pendingApprovalsTotalCents,
      countLabel: pendingQuoteCount === 1 ? 'quote' : 'quotes',
      amountLabel: 'pending approvals'
    },
    {
      label: 'Open requests',
      href: '/customer/notifications',
      count: openRequestCount,
      countLabel: openRequestCount === 1 ? 'open request' : 'open requests',
      detail:
        urgentOpenRequests > 0 ? `${urgentOpenRequests} urgent` : 'No urgency',
      amount: 0
    },
    {
      label: 'Open recommendations',
      href: '/customer/notifications',
      count: openRecommendationCount,
      countLabel:
        openRecommendationCount === 1
          ? 'open recommendation'
          : 'open recommendations',
      detail:
        urgentOpenRecommendations > 0
          ? `${urgentOpenRecommendations} urgent`
          : 'No urgency',
      amount: 0
    }
  ];

  const activeMetrics = metrics.filter(
    (metric) => metric.count > 0 || (metric.amount ?? 0) > 0
  );
  const actionTarget =
    unpaidInvoiceCount > 0
      ? { href: '/customer/notifications', label: 'Review invoices' }
      : pendingQuoteCount > 0
        ? { href: '/customer/notifications', label: 'Review quotes' }
        : pendingVerificationCount > 0
          ? { href: '/customer/vehicles/new', label: 'Complete verification' }
          : null;

  const money = (cents: number) => `R${(cents / 100).toFixed(2)}`;

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

  const invoicesByVehicle = new Map<string, number>();
  (unpaidInvoices ?? []).forEach((invoice) => {
    if (!invoice.vehicle_id) return;
    invoicesByVehicle.set(
      invoice.vehicle_id,
      (invoicesByVehicle.get(invoice.vehicle_id) ?? 0) + 1
    );
  });

  const quotesByVehicle = new Map<string, number>();
  (pendingQuotes ?? []).forEach((quote) => {
    if (!quote.vehicle_id) return;
    quotesByVehicle.set(
      quote.vehicle_id,
      (quotesByVehicle.get(quote.vehicle_id) ?? 0) + 1
    );
  });

  const requestsByVehicle = new Map<string, number>();
  (openRequests ?? []).forEach((request) => {
    if (!request.vehicle_id) return;
    requestsByVehicle.set(
      request.vehicle_id,
      (requestsByVehicle.get(request.vehicle_id) ?? 0) + 1
    );
  });

  return (
    <main className="space-y-5 pb-4">
      <HeroHeader
        title="Customer dashboard"
        subtitle="Track your vehicles, active work, and account alerts."
        actions={
          <Button asChild>
            <Link href={customerVehicleNew()}>Add vehicle</Link>
          </Button>
        }
      />

      <section className="rounded-3xl border border-black/10 bg-white/95 p-4 shadow-[0_10px_40px_rgba(17,17,17,0.06)] sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            Overview
          </p>
          <span className="rounded-full border border-black/10 bg-gray-50 px-2.5 py-1 text-xs font-medium capitalize text-gray-700">
            {account?.tier ?? 'basic'} plan
          </span>
        </div>
        <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
          <div className="flex items-center justify-center rounded-2xl border border-black/10 bg-gray-50/60 p-2">
            <SegmentRing
              mode="value"
              value={usedVehicles}
              total={allowedVehicles}
              centerLabel={`${usedVehicles} / ${allowedVehicles}`}
              subLabel="Vehicle slots"
              size={128}
            />
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {activeMetrics.length === 0 ? (
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-emerald-800 sm:col-span-2">
                <p className="font-semibold">All clear</p>
                <p className="text-xs text-emerald-700">
                  No invoices, quotes, requests, or recommendations need
                  attention.
                </p>
              </div>
            ) : (
              activeMetrics.map((metric) => (
                <Link
                  href={metric.href}
                  key={metric.label}
                  className="rounded-2xl border border-black/10 bg-white px-3 py-3 transition hover:border-red-200 hover:bg-red-50/30"
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                    {metric.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-black">
                    {metric.count}{' '}
                    <span className="text-sm font-medium text-gray-600">
                      {metric.countLabel}
                    </span>
                  </p>
                  {(metric.amount ?? 0) > 0 ? (
                    <p className="text-xs text-gray-600">
                      <span className="font-semibold text-black">
                        {money(metric.amount ?? 0)}
                      </span>{' '}
                      {metric.amountLabel}
                    </p>
                  ) : metric.detail ? (
                    <p className="text-xs text-gray-600">{metric.detail}</p>
                  ) : null}
                </Link>
              ))
            )}
          </div>
        </div>
      </section>

      {actionTarget ? (
        <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-200 bg-gradient-to-r from-red-50 to-white px-4 py-2.5">
          <p className="text-sm font-medium text-red-900">
            Action required: Please review items waiting on your approval.
          </p>
          <Button asChild size="sm" className="bg-red-600 hover:bg-red-700">
            <Link href={actionTarget.href}>{actionTarget.label}</Link>
          </Button>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
          {(vehicles ?? []).length === 0 ? (
            <Card className="rounded-3xl">
              <p className="text-sm text-gray-600">
                No vehicles yet. Add your first vehicle to start tracking
                service history.
              </p>
            </Card>
          ) : null}
          {(vehicles ?? []).map((vehicle) => (
            <Card key={vehicle.id} className="space-y-3 rounded-3xl p-4">
              {vehicle.primary_image_path ? (
                <img
                  src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                  alt={`${vehicle.registration_number} vehicle`}
                  className="h-36 w-full rounded-2xl object-cover"
                />
              ) : (
                <div className="h-36 rounded-2xl bg-gray-100" />
              )}
              <h2 className="text-xl font-semibold">
                {vehicle.registration_number}
              </h2>
              <p className="text-sm text-gray-600">
                {vehicle.make ?? 'Unknown'} {vehicle.model ?? ''}{' '}
                {vehicle.year ? `(${vehicle.year})` : ''}
              </p>
              <div className="flex flex-wrap gap-2">
                <span
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase ${vehicleStatusTone(vehicle.status)}`}
                >
                  {vehicle.status ?? 'pending'}
                </span>
                <span className="rounded-full border border-black/10 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700">
                  {invoicesByVehicle.get(vehicle.id) ?? 0} invoices
                </span>
                <span className="rounded-full border border-black/10 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700">
                  {quotesByVehicle.get(vehicle.id) ?? 0} quotes
                </span>
                <span className="rounded-full border border-black/10 bg-gray-50 px-2.5 py-1 text-[11px] text-gray-700">
                  {requestsByVehicle.get(vehicle.id) ?? 0} requests
                </span>
              </div>
              <Button asChild variant="secondary" className="w-full">
                <Link href={customerVehicle(vehicle.id)}>Open vehicle</Link>
              </Button>
            </Card>
          ))}
        </section>

        {(unreadCount ?? 0) > 0 ? (
          <Card className="h-fit rounded-3xl">
            <h3 className="text-lg font-semibold">Unread notifications</h3>
            <div className="mt-3 space-y-2">
              {(notifications ?? []).map((notification) => (
                <div key={notification.id} className="rounded-2xl border p-3">
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
            <Button
              asChild
              variant="secondary"
              size="sm"
              className="mt-3 w-full"
            >
              <Link href="/customer/notifications">View all notifications</Link>
            </Button>
          </Card>
        ) : null}
      </div>
    </main>
  );
}
