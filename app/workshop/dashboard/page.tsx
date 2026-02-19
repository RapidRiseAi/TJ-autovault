import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeroHeader } from '@/components/layout/hero-header';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { SectionCard } from '@/components/ui/section-card';
import { StatCard } from '@/components/ui/stat-card';
import { SegmentRing } from '@/components/ui/segment-ring';

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  profile_image_url?: string | null;
  vehicles?: Array<{ primary_image_path: string | null }> | null;
  customer_users: Array<{ profile_id: string | null }> | null;
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
  const [{ count: vehicles }, { count: openRequests }, { count: unpaidInvoices }, { count: pendingQuotes }, { data: customerRows }, { data: pendingVehicles }] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase.from('work_requests').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['requested', 'waiting_for_deposit', 'waiting_for_parts', 'scheduled', 'in_progress']),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['sent', 'pending']),
    supabase.from('customer_accounts').select('id,name,created_at,profile_image_url,customer_users(profile_id),vehicles(primary_image_path)').eq('workshop_account_id', workshopId).order('created_at', { ascending: false }).limit(100),
    supabase.from('vehicles').select('id,registration_number,status,primary_image_path').eq('workshop_account_id', workshopId).ilike('status', '%pending%').limit(8)
  ]);

  const uniqueCustomers = (customerRows as CustomerRow[] | null)?.reduce<CustomerRow[]>((acc, row) => {
    const profileId = row.customer_users?.[0]?.profile_id;
    const dedupeKey = profileId ?? row.id;
    if (!acc.some((entry) => (entry.customer_users?.[0]?.profile_id ?? entry.id) === dedupeKey)) acc.push(row);
    return acc;
  }, []) ?? [];

  const cards = [
    ['Customers count', uniqueCustomers.length],
    ['Vehicles count', vehicles ?? 0],
    ['Open requests', openRequests ?? 0],
    ['Unpaid invoices', unpaidInvoices ?? 0],
    ['Pending quotes', pendingQuotes ?? 0],
    ['Vehicles pending verification', pendingVehicles?.length ?? 0]
  ];

  return (
    <main className="space-y-6">
      <HeroHeader title="Workshop dashboard" subtitle="Track customers, jobs, and payments from one place." actions={<Button asChild variant="secondary" size="sm"><Link href="/workshop/work-requests">Open work request board</Link></Button>} />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {cards.map(([label, value]) => (
          <StatCard
            key={label as string}
            title={label as string}
            value={value as number}
            ring={
              label === 'Vehicles pending verification' ? (
                <SegmentRing size={70} centerLabel={String(value)} subLabel="Pending" total={Math.max(vehicles ?? 0, 1)} segments={[{ value: Number(value), tone: 'negative' }]} />
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
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-black/10 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.14em] text-gray-500">
                <th className="pb-2 font-semibold">Name</th>
                <th className="pb-2 font-semibold">Created</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {uniqueCustomers.map((customer) => (
                <tr key={customer.id} className="hover:bg-stone-50">
                  <td className="py-3 text-sm font-medium text-black">
                    <div className="flex items-center gap-3">
                      {customer.profile_image_url ? (
                        <img src={customer.profile_image_url} alt={customer.name} className="h-9 w-9 rounded-full border border-black/10 object-cover" />
                      ) : customer.vehicles?.[0]?.primary_image_path ? (
                        <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(customer.vehicles[0].primary_image_path)}`} alt={customer.name} className="h-9 w-9 rounded-full border border-black/10 object-cover" />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-black/10 bg-white text-xs font-semibold text-black/80">{initials(customer.name)}</div>
                      )}
                      <span>{customer.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-gray-600">{new Date(customer.created_at).toLocaleDateString()}</td>
                  <td className="py-3 text-right"><Button asChild size="sm" variant="outline"><Link href={`/workshop/customers/${customer.id}`}>Open</Link></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!uniqueCustomers.length ? <p className="py-4 text-sm text-gray-500">No customers yet.</p> : null}
        </div>
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
