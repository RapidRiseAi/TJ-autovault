import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
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

  const [{ data: account }, { data: vehicles }, { count: unpaidInvoices }, { count: pendingQuotes }, { count: openRecommendations }] = await Promise.all([
    supabase.from('customer_accounts').select('tier,vehicle_limit,plan_price_cents').eq('id', customerAccount.id).single(),
    supabase.from('vehicles').select('id,registration_number,make,model,year,status,odometer_km,primary_image_path').eq('current_customer_account_id', customerAccount.id).order('created_at', { ascending: false }),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccount.id).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccount.id).eq('status', 'sent'),
    supabase.from('recommendations').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccount.id).eq('status_text', 'open')
  ]);

  const stats = [
    ['Vehicles count', vehicles?.length ?? 0],
    ['Unpaid invoices', unpaidInvoices ?? 0],
    ['Pending quotes', pendingQuotes ?? 0],
    ['Open recommendations', openRecommendations ?? 0]
  ];

  return (
    <main className="space-y-5">
      <div className="flex items-center justify-between"><h1 className="text-2xl font-bold">Customer dashboard</h1><Link href={customerVehicleNew()} className="rounded bg-brand-red px-3 py-2 text-sm text-white">Add vehicle</Link></div>
      <Card>
        <p className="text-sm">Plan: <span className="font-semibold capitalize">{account?.tier ?? 'basic'}</span> · {(vehicles?.length ?? 0)} / {account?.vehicle_limit ?? 1} vehicles used</p>
        <Link href="/customer/plan" className="text-sm text-brand-red underline">Upgrade plan</Link>
      </Card>
      <div className="grid gap-3 md:grid-cols-4">{stats.map(([label, value]) => <Card key={label as string}><p className="text-xs uppercase text-gray-500">{label}</p><p className="text-2xl font-bold">{value as number}</p></Card>)}</div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(vehicles ?? []).map((vehicle) => (
          <Card key={vehicle.id} className="space-y-2">
            {vehicle.primary_image_path ? (
              <img
                src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
                alt={`${vehicle.registration_number} vehicle`}
                className="h-32 w-full rounded object-cover"
              />
            ) : <div className="h-32 rounded bg-gray-100" />}
            <h2 className="text-xl font-semibold">{vehicle.registration_number}</h2>
            <p className="text-sm text-gray-600">{vehicle.make} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ''}</p>
            <p className="text-xs uppercase">Status: <span className="font-semibold">{vehicle.status ?? 'pending'}</span></p>
            <Link className="text-sm font-medium text-brand-red underline" href={customerVehicle(vehicle.id)}>View vehicle</Link>
          </Card>
        ))}
      </div>
    </main>
  );
}
