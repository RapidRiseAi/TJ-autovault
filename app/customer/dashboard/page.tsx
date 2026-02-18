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
    { count: unpaidInvoices },
    { count: pendingQuotes },
    { count: openRecommendations },
    { data: notifications },
    { count: unreadCount }
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
      .select('id', { count: 'exact', head: true })
      .eq('customer_account_id', customerAccount.id)
      .neq('payment_status', 'paid'),
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('customer_account_id', customerAccount.id)
      .eq('status', 'sent'),
    supabase
      .from('recommendations')
      .select('id', { count: 'exact', head: true })
      .eq('customer_account_id', customerAccount.id)
      .eq('status_text', 'open'),
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
      .is('deleted_at', null)
  ]);

  const usedVehicles = vehicles?.length ?? 0;
  const allowedVehicles = account?.vehicle_limit ?? 1;

  const stats = [
    ['Unpaid invoices', unpaidInvoices ?? 0],
    ['Pending quotes', pendingQuotes ?? 0],
    ['Open recommendations', openRecommendations ?? 0]
  ];

  return (
    <main className="space-y-6">
      <HeroHeader
        title="Customer dashboard"
        subtitle="Track your vehicles, active work, and account alerts."
        meta={
          <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 capitalize">
            {account?.tier ?? 'basic'} plan
          </span>
        }
        actions={
          <Button asChild>
            <Link href={customerVehicleNew()}>Add vehicle</Link>
          </Button>
        }
      />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,280px)_minmax(0,1fr)]">
        <Card className="flex items-center justify-center">
          <SegmentRing
            mode="value"
            value={usedVehicles}
            total={allowedVehicles}
            centerLabel={`${usedVehicles} / ${allowedVehicles}`}
            subLabel="Vehicles used"
          />
        </Card>

        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map(([label, value]) => (
            <Card key={label as string} className="space-y-1">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                {label}
              </p>
              <p className="text-3xl font-semibold text-black">
                {value as number}
              </p>
            </Card>
          ))}
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {(vehicles ?? []).length === 0 ? (
            <Card>
              <p className="text-sm text-gray-600">
                No vehicles yet. Add your first vehicle to start tracking
                service history.
              </p>
            </Card>
          ) : null}
          {(vehicles ?? []).map((vehicle) => (
            <Card key={vehicle.id} className="space-y-3 rounded-3xl">
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
              <p className="text-xs uppercase text-gray-600">
                Status:{' '}
                <span className="font-semibold text-black">
                  {vehicle.status ?? 'pending'}
                </span>
              </p>
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
