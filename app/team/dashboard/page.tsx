import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

const TEAM_DASHBOARD_EMAIL = 'team@rapidriseai.com';
const GB_IN_BYTES = 1024 * 1024 * 1024;

type CustomerAccountRow = {
  id: string;
  name: string;
  linked_email: string | null;
  onboarding_status: string | null;
  plan_price_cents: number | string | null;
};

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    maximumFractionDigits: 2
  }).format(cents / 100);
}

function formatStorage(bytes: number) {
  if (bytes >= GB_IN_BYTES) return `${(bytes / GB_IN_BYTES).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function paymentStatusLabel(status: string | null) {
  if (status === 'active_paid') return 'paid';
  if (status === 'registered_unpaid') return 'unpaid';
  return 'prospect';
}

export default async function TeamDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const email = (user.email ?? '').trim().toLowerCase();
  if (email !== TEAM_DASHBOARD_EMAIL) redirect('/workshop/dashboard');

  const admin = createAdminClient();

  const [{ data: customers }, { data: vehicles }, { data: storageDocs }] = await Promise.all([
    admin
      .from('customer_accounts')
      .select('id,name,linked_email,onboarding_status,plan_price_cents')
      .order('name', { ascending: true }),
    admin.from('vehicles').select('id,current_customer_account_id').limit(50000),
    admin.from('vehicle_documents').select('customer_account_id,size_bytes').limit(50000)
  ]);

  const customerRows = (customers ?? []) as CustomerAccountRow[];

  const vehiclesByCustomerId = new Map<string, number>();
  for (const vehicle of vehicles ?? []) {
    const customerAccountId = vehicle.current_customer_account_id;
    if (!customerAccountId) continue;
    vehiclesByCustomerId.set(
      customerAccountId,
      (vehiclesByCustomerId.get(customerAccountId) ?? 0) + 1
    );
  }

  const storageByCustomerId = new Map<string, number>();
  for (const document of storageDocs ?? []) {
    const customerAccountId = document.customer_account_id;
    if (!customerAccountId) continue;
    const bytes = Number(document.size_bytes ?? 0);
    storageByCustomerId.set(
      customerAccountId,
      (storageByCustomerId.get(customerAccountId) ?? 0) + bytes
    );
  }

  const totalUsedStorageBytes = Array.from(storageByCustomerId.values()).reduce(
    (sum, bytes) => sum + bytes,
    0
  );

  const paidCustomers = customerRows.filter(
    (customer) => customer.onboarding_status === 'active_paid'
  );

  const monthlyIncomeCents = paidCustomers.reduce(
    (sum, customer) => sum + Number(customer.plan_price_cents ?? 0),
    0
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <PageHeader
        title="RapidRise Team Dashboard"
        subtitle="Private developer view for customer storage, payment status, and monthly income."
      />

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-2xl border-black/10 p-5">
          <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Total used storage</p>
          <p className="mt-2 text-2xl font-semibold text-black">{formatStorage(totalUsedStorageBytes)}</p>
        </Card>
        <Card className="rounded-2xl border-black/10 p-5">
          <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Paid customer accounts</p>
          <p className="mt-2 text-2xl font-semibold text-black">{paidCustomers.length}</p>
        </Card>
        <Card className="rounded-2xl border-black/10 p-5">
          <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Monthly income (paid accounts)</p>
          <p className="mt-2 text-2xl font-semibold text-black">{formatMoney(monthlyIncomeCents)}</p>
        </Card>
      </section>

      <Card className="rounded-2xl border-black/10 p-5">
        <h2 className="text-base font-semibold text-black">Paid users and account status</h2>
        <p className="mt-1 text-sm text-gray-600">
          Every paid customer account with payment status, vehicle count, and monthly plan amount.
        </p>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-black/10 text-xs uppercase tracking-[0.12em] text-gray-500">
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Payment status</th>
                <th className="px-2 py-2">Vehicles</th>
                <th className="px-2 py-2">Storage used</th>
                <th className="px-2 py-2">Monthly amount</th>
              </tr>
            </thead>
            <tbody>
              {paidCustomers.map((customer) => (
                <tr key={customer.id} className="border-b border-black/5 align-top">
                  <td className="px-2 py-3">
                    <p className="font-medium text-black">{customer.name}</p>
                    <p className="text-xs text-gray-500">{customer.linked_email ?? 'No linked email'}</p>
                  </td>
                  <td className="px-2 py-3 capitalize text-gray-700">
                    {paymentStatusLabel(customer.onboarding_status)}
                  </td>
                  <td className="px-2 py-3 text-gray-700">{vehiclesByCustomerId.get(customer.id) ?? 0}</td>
                  <td className="px-2 py-3 text-gray-700">
                    {formatStorage(storageByCustomerId.get(customer.id) ?? 0)}
                  </td>
                  <td className="px-2 py-3 font-medium text-black">
                    {formatMoney(Number(customer.plan_price_cents ?? 0))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!paidCustomers.length ? (
            <p className="pt-4 text-sm text-gray-500">No paid customer accounts yet.</p>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
