import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopCustomerPage({ params }: { params: Promise<{ customerAccountId: string }> }) {
  const { customerAccountId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const { data: customer } = await supabase
    .from('customer_accounts')
    .select('id,name,customer_users(profile_id,profiles(display_name))')
    .eq('id', customerAccountId)
    .eq('workshop_account_id', workshopId)
    .single();
  if (!customer) notFound();

  const customerDisplayName = customer.customer_users?.[0]?.profiles?.[0]?.display_name || customer.name;

  const [{ data: vehicles }, { count: unpaidInvoices }, { count: pendingQuotes }, { count: activeJobs }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number')
      .eq('current_customer_account_id', customerAccountId)
      .eq('workshop_account_id', workshopId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).in('status', ['sent', 'pending']),
    supabase.from('service_jobs').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).in('status', ['open', 'awaiting_approval', 'in_progress'])
  ]);

  const isVehiclesLoading = vehicles === null;
  const hasVehicles = Array.isArray(vehicles) && vehicles.length > 0;
  const primaryVehicle = hasVehicles ? vehicles[0] : null;

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">{customerDisplayName}</h1>
      <p className="text-sm text-gray-600">Customer account: {customer.name}</p>
      <div className="grid gap-3 md:grid-cols-3">
        {[
          ['Vehicles', hasVehicles ? vehicles.length : 0],
          ['Open quotes', pendingQuotes ?? 0],
          ['Unpaid invoices', unpaidInvoices ?? 0],
          ['Active jobs', activeJobs ?? 0]
        ].map(([label, value]) => (
          <Card key={label as string}>
            <p className="text-xs text-gray-500">{label}</p>
            <p className="text-2xl font-bold">{value as number}</p>
          </Card>
        ))}
      </div>
      <Card>
        <h2 className="mb-2 font-semibold">Vehicles</h2>
        {isVehiclesLoading ? <p className="text-sm text-gray-500">Loading vehicles...</p> : null}
        {!isVehiclesLoading && !hasVehicles ? (
          <div className="space-y-2">
            <button
              type="button"
              disabled
              className="cursor-not-allowed rounded border border-gray-200 px-3 py-2 text-sm text-gray-500"
              aria-disabled="true"
            >
              No vehicles yet
            </button>
            <p className="text-sm text-gray-500">No vehicles linked to this customer.</p>
          </div>
        ) : null}
        {hasVehicles ? (
          <div className="space-y-2">
            {primaryVehicle ? (
              <Link className="inline-block rounded border border-gray-200 px-3 py-2 text-sm underline" href={`/workshop/vehicles/${primaryVehicle.id}`}>
                View vehicle
              </Link>
            ) : null}
            {vehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded border p-2 text-sm">
                <p>{vehicle.registration_number}</p>
                <div className="mt-1 flex gap-3 text-xs">
                  <Link className="underline" href={`/workshop/vehicles/${vehicle.id}`}>
                    View vehicle
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </Card>
    </main>
  );
}
