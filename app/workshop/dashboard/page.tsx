import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  customer_users: Array<{ profile_id: string | null }> | null;
};

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

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Workshop dashboard</h1>
      <div className="grid gap-3 md:grid-cols-5">{[['Customers count', uniqueCustomers.length], ['Vehicles count', vehicles ?? 0], ['Open requests', openRequests ?? 0], ['Unpaid invoices', unpaidInvoices ?? 0], ['Pending quotes', pendingQuotes ?? 0]].map(([label, value]) => <Card key={label as string}><p className="text-xs uppercase text-gray-500">{label}</p><p className="text-2xl font-bold">{value as number}</p></Card>)}</div>
      <Card>
        <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold">Customers</h2><Link href="/workshop/work-requests" className="text-xs text-brand-red underline">Open work request board</Link></div>
        <div className="space-y-2">
          {uniqueCustomers.map((c) => <Link key={c.id} href={`/workshop/customers/${c.id}`} className="block rounded border p-2 text-sm hover:bg-gray-50">{c.name}</Link>)}
          {!uniqueCustomers.length ? <p className="text-sm text-gray-500">No customers yet.</p> : null}
        </div>
      </Card>
    </main>
  );
}
