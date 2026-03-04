import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopCustomerStatementsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile?.workshop_account_id || profile.role !== 'admin') {
    redirect('/workshop/dashboard');
  }

  const { data: customers } = await supabase
    .from('customer_accounts')
    .select('id,name')
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('name', { ascending: true });

  const today = new Date();
  const to = today.toISOString().slice(0, 10);
  const fromDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 1);
  const from = fromDate.toISOString().slice(0, 10);

  return (
    <main className="space-y-4">
      <PageHeader
        title="Customer statements"
        subtitle="Export invoice/quote statements by customer and date range."
      />

      <section className="rounded-2xl border bg-white p-5">
        <form className="grid gap-3 md:grid-cols-2" action="/api/workshop/customer-statements/export" method="GET">
          <label className="text-sm font-medium">
            Customer
            <select name="customerId" className="mt-1 w-full rounded border p-2" required>
              <option value="">Select customer</option>
              {(customers ?? []).map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium">
            Document type
            <select name="type" className="mt-1 w-full rounded border p-2" defaultValue="both">
              <option value="both">Invoices + Quotes</option>
              <option value="invoice">Invoices only</option>
              <option value="quote">Quotes only</option>
            </select>
          </label>

          <label className="text-sm font-medium">
            From date
            <input type="date" name="from" defaultValue={from} className="mt-1 w-full rounded border p-2" required />
          </label>

          <label className="text-sm font-medium">
            To date
            <input type="date" name="to" defaultValue={to} className="mt-1 w-full rounded border p-2" required />
          </label>

          <label className="text-sm font-medium">
            Export format
            <select name="format" className="mt-1 w-full rounded border p-2" defaultValue="pdf">
              <option value="pdf">PDF statement</option>
              <option value="csv">CSV statement</option>
            </select>
          </label>

          <div className="self-end">
            <button type="submit" className="w-full rounded bg-black px-4 py-2 text-white">
              Download statement
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
