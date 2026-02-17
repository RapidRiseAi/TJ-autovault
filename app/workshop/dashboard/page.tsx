import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopDashboardPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [{ count: customers }, { count: vehicles }, { count: openRequests }, { count: unpaidInvoices }, { count: pendingApprovals }, { data: customerRows }] = await Promise.all([
    supabase.from('customer_accounts').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId),
    supabase.from('work_requests').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).in('status', ['requested', 'scheduled', 'in_progress']),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('workshop_account_id', workshopId).eq('status', 'sent'),
    supabase.from('customer_accounts').select('id,name,created_at').eq('workshop_account_id', workshopId).order('created_at', { ascending: false }).limit(25)
  ]);

  return (
    <main className="space-y-6">
      <h1 className="text-2xl font-bold">Workshop dashboard</h1>
      <div className="grid gap-3 md:grid-cols-5">{[['Customers count', customers ?? 0], ['Vehicles count', vehicles ?? 0], ['Open requests', openRequests ?? 0], ['Unpaid invoices', unpaidInvoices ?? 0], ['Pending quote approvals', pendingApprovals ?? 0]].map(([label, value]) => <Card key={label as string}><p className="text-xs uppercase text-gray-500">{label}</p><p className="text-2xl font-bold">{value as number}</p></Card>)}</div>
      <Card>
        <h2 className="mb-2 font-semibold">Customers</h2>
        <div className="space-y-2">
          {(customerRows ?? []).map((c) => <Link key={c.id} href={`/workshop/customers/${c.id}`} className="block rounded border p-2 text-sm hover:bg-gray-50">{c.name}</Link>)}
        </div>
      </Card>
    </main>
  );
}
