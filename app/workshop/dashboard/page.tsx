import Link from 'next/link';
import { redirect } from 'next/navigation';
import { HeroHeader } from '@/components/layout/hero-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  customer_users: Array<{ profile_id: string | null }> | null;
};

const statCards = [
  { key: 'customers', label: 'Customers count' },
  { key: 'vehicles', label: 'Vehicles count' },
  { key: 'requests', label: 'Open requests' },
  { key: 'invoices', label: 'Unpaid invoices' },
  { key: 'quotes', label: 'Pending quotes' }
] as const;

export default async function WorkshopDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [{ count: vehicles }, { count: openRequests }, { count: unpaidInvoices }, { count: pendingQuotes }, { data: customerRows }] = await Promise.all([
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase.from('work_requests').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['requested', 'waiting_for_deposit', 'waiting_for_parts', 'scheduled', 'in_progress']),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['sent', 'pending']),
    supabase.from('customer_accounts').select('id,name,created_at,customer_users(profile_id)').eq('workshop_account_id', workshopId).order('created_at', { ascending: false }).limit(100)
  ]);

  const uniqueCustomers = (customerRows as CustomerRow[] | null)?.reduce<CustomerRow[]>((acc, row) => {
    const profileId = row.customer_users?.[0]?.profile_id;
    const dedupeKey = profileId ?? row.id;
    if (!acc.some((entry) => (entry.customer_users?.[0]?.profile_id ?? entry.id) === dedupeKey)) acc.push(row);
    return acc;
  }, []) ?? [];

  const values = {
    customers: uniqueCustomers.length,
    vehicles: vehicles ?? 0,
    requests: openRequests ?? 0,
    invoices: unpaidInvoices ?? 0,
    quotes: pendingQuotes ?? 0
  };

  return (
    <main className="space-y-6">
      <HeroHeader
        title="Workshop dashboard"
        subtitle="Track customers, jobs, and payments from one place."
        actions={
          <Button asChild variant="secondary" size="sm">
            <Link href="/workshop/work-requests">Open work request board</Link>
          </Button>
        }
      />

      <section className="grid gap-3 md:grid-cols-5">
        {statCards.map((stat) => (
          <Card key={stat.key} className="p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{stat.label}</p>
            <p className="mt-2 text-2xl font-semibold text-black">{values[stat.key]}</p>
          </Card>
        ))}
      </section>

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-brand-black">Customers</h2>
          <Link href="/workshop/customers" className="text-xs font-semibold text-brand-red underline">View all</Link>
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
                <tr key={customer.id}>
                  <td className="py-3 text-sm font-medium text-black">{customer.name}</td>
                  <td className="py-3 text-sm text-gray-600">{new Date(customer.created_at).toLocaleDateString()}</td>
                  <td className="py-3 text-right">
                    <Link href={`/workshop/customers/${customer.id}`} className="text-xs font-semibold text-brand-red underline">
                      Open
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!uniqueCustomers.length ? <p className="py-4 text-sm text-gray-500">No customers yet.</p> : null}
        </div>
      </Card>
    </main>
  );
}
