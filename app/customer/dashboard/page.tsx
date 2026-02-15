import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { customerVehicle, customerVehicleNew } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  if (!customerAccount) notFound();

  const { data: vehicles } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,status,created_at')
    .eq('current_customer_account_id', customerAccount.id)
    .order('created_at', { ascending: false });

  return (
    <main className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Customer dashboard</h1>
        <Link
          href={customerVehicleNew()}
          className="rounded bg-brand-red px-3 py-2 text-sm font-medium text-white"
        >
          Add vehicle
        </Link>
      </div>

      {(vehicles ?? []).length === 0 ? (
        <Card className="space-y-3">
          <p className="text-sm text-gray-600">
            No vehicles found for your account.
          </p>
          <Link
            href={customerVehicleNew()}
            className="inline-block rounded bg-brand-red px-4 py-2 text-sm font-medium text-white"
          >
            Add vehicle
          </Link>
        </Card>
      ) : null}

      {(vehicles ?? []).map((vehicle) => (
        <Card
          key={vehicle.id}
          className="relative transition hover:border-brand-red/40 hover:shadow-md"
        >
          <Link
            href={customerVehicle(vehicle.id)}
            className="absolute inset-0 rounded-lg"
            aria-label={`View vehicle details for ${vehicle.registration_number}`}
          />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {vehicle.registration_number}
              </h2>
              <p className="text-sm text-gray-600">
                {vehicle.make
                  ? `${vehicle.make} ${vehicle.model ?? ''}`.trim()
                  : 'Make/model unavailable'}
              </p>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Status: {vehicle.status ?? 'pending_verification'}
              </p>
            </div>
            <div className="text-right text-sm">
              <Link
                href={customerVehicle(vehicle.id)}
                className="relative z-10 text-brand-red underline"
              >
                View details
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}
