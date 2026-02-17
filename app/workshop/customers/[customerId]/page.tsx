import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopCustomerPage({ params }: { params: Promise<{ customerId: string }> }) {
  const { customerId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const { data: customer } = await supabase
    .from('customer_accounts')
    .select('id,name,customer_users(profile_id,profiles(display_name))')
    .eq('id', customerId)
    .eq('workshop_account_id', workshopId)
    .single();
  if (!customer) notFound();

  const customerDisplayName = customer.customer_users?.[0]?.profiles?.[0]?.display_name || customer.name;

  const [{ data: vehicles }, { count: unpaidInvoices }, { count: pendingQuotes }, { count: openRequests }] = await Promise.all([
    supabase.from('vehicles').select('id,registration_number,make,model,status').eq('current_customer_account_id', customerId).eq('workshop_account_id', workshopId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerId).in('status', ['sent', 'pending']),
    supabase.from('work_requests').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerId).in('status', ['requested', 'scheduled', 'in_progress'])
  ]);

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">{customerDisplayName}</h1>
      <p className="text-sm text-gray-600">Customer account: {customer.name}</p>
      <div className="grid gap-3 md:grid-cols-3">{[['Open requests', openRequests ?? 0], ['Pending quotes', pendingQuotes ?? 0], ['Unpaid invoices', unpaidInvoices ?? 0]].map(([l,v]) => <Card key={l as string}><p className="text-xs text-gray-500">{l}</p><p className="text-2xl font-bold">{v as number}</p></Card>)}</div>
      <Card>
        <h2 className="mb-2 font-semibold">Vehicles</h2>
        {(vehicles ?? []).map((v) => <div key={v.id} className="mb-2 rounded border p-2 text-sm"><p>{v.registration_number} · {v.make} {v.model}</p><div className="mt-1 flex gap-3 text-xs"><Link className="underline" href={`/workshop/vehicles/${v.id}`}>View vehicle</Link></div></div>)}
        {!vehicles?.length ? <p className="text-sm text-gray-500">No vehicles linked to this customer.</p> : null}
      </Card>
    </main>
  );
}
