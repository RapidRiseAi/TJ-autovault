import Link from 'next/link';
import { redirect } from 'next/navigation';
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
    profiles?: Array<{ display_name: string | null; full_name: string | null; avatar_url: string | null }>;
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

export default async function WorkshopDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [{ count: vehicles }, { count: openRequests }, { count: unpaidInvoices }, { count: pendingQuotes }, customerResult, { data: pendingVehicles }] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase.from('work_requests').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['requested', 'waiting_for_deposit', 'waiting_for_parts', 'scheduled', 'in_progress']),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['sent', 'pending']),
    supabase
      .from('customer_accounts')
      .select('id,name,created_at,customer_users(profiles(display_name,full_name,avatar_url))')
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
      .limit(100),
    supabase.from('vehicles').select('id,registration_number,status,primary_image_path').eq('workshop_account_id', workshopId).ilike('status', '%pending%').limit(8)
  ]);

  const customerRows = (customerResult.data ?? []) as CustomerRow[];
  const customersError = customerResult.error;

  const cards = [
    ['Customers count', customerRows.length, 'Linked customer accounts'],
    ['Vehicles count', vehicles ?? 0, 'Managed in your workshop'],
    ['Open requests', openRequests ?? 0, 'Work currently in progress'],
    ['Unpaid invoices', unpaidInvoices ?? 0, 'Outstanding billing'],
    ['Pending quotes', pendingQuotes ?? 0, 'Awaiting customer decision'],
    ['Vehicles pending verification', pendingVehicles?.length ?? 0, 'Needs workshop verification']
  ] as const;

  return (
    <main className="space-y-6">
      <HeroHeader title="Workshop dashboard" subtitle="Track customers, jobs, and payments from one place." actions={<Button asChild variant="secondary" size="sm"><Link href="/workshop/work-requests">Open work request board</Link></Button>} />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        {cards.map(([label, value, support]) => (
          <MetricCard
            key={label}
            label={label}
            value={value}
            support={support}
            visual={
              label === 'Vehicles pending verification' ? (
                <SegmentRing size={72} centerLabel={String(value)} subLabel="Pending" total={Math.max(vehicles ?? 0, 1)} segments={[{ value: Number(value), tone: 'negative' }]} />
              ) : undefined
            }
          />
        ))}
      </section>

      <SectionCard>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-black">Customers</h2>
          <Button asChild size="sm" variant="secondary"><Link href="/workshop/customers">View all</Link></Button>
        </div>
        {customersError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">Unable to load customers right now. Please refresh and try again.</p> : null}
        {!customersError ? (
          <div className="space-y-2">
            {customerRows.map((customer) => {
              const profileInfo = customer.customer_users?.[0]?.profiles?.[0];
              const customerName = profileInfo?.full_name || profileInfo?.display_name || customer.name;
              const businessName = customer.name;
              const avatar = profileInfo?.avatar_url;

              return (
                <div key={customer.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-3 hover:bg-stone-50">
                  <div className="flex items-center gap-3">
                    {avatar ? (
                      <img src={avatar} alt={customerName} className="h-10 w-10 rounded-full border border-black/10 object-cover" />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-full border border-black/10 bg-white text-xs font-semibold text-black/80">{initials(customerName)}</div>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-brand-black">{customerName}</p>
                      <p className="text-xs text-gray-500">{businessName}</p>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline"><Link href={`/workshop/customers/${customer.id}`}>Open profile</Link></Button>
                </div>
              );
            })}
            {!customerRows.length ? <p className="py-4 text-sm text-gray-500">No customers yet.</p> : null}
          </div>
        ) : null}
      </SectionCard>

      <SectionCard>
        <h2 className="mb-3 text-lg font-semibold text-brand-black">Pending verification</h2>
        {!pendingVehicles?.length ? <p className="text-sm text-gray-500">No vehicles pending verification.</p> : (
          <div className="space-y-2">
            {pendingVehicles.map((vehicle) => (
              <div key={vehicle.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-3">
                <div>
                  <p className="text-sm font-semibold">{vehicle.registration_number}</p>
                  <p className="text-xs text-gray-500">{vehicle.status ?? 'pending'}</p>
                </div>
                <div className="flex gap-2"><VerifyVehicleButton vehicleId={vehicle.id} /><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}`}>Open vehicle</Link></Button></div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </main>
  );
}
