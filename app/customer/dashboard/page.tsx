import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function CustomerDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  const { data: memberships } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id);

  const customerAccountIds = memberships?.map((membership) => membership.customer_account_id) ?? [];

  const { data: vehicles } = customerAccountIds.length
    ? await supabase
        .from('vehicles')
        .select('id,registration_number,make,model,created_at')
        .in('current_customer_account_id', customerAccountIds)
        .order('created_at', { ascending: false })
    : { data: [] };

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Customer dashboard</h1>
      {(vehicles ?? []).length === 0 ? (
        <Card>
          <p className="text-sm text-gray-600">No vehicles found for your account.</p>
        </Card>
      ) : null}
      {(vehicles ?? []).map((vehicle) => (
        <Card key={vehicle.id} className="relative transition hover:border-brand-red/40 hover:shadow-md">
          <Link
            href={`/customer/vehicles/${vehicle.id}`}
            className="absolute inset-0 rounded-lg"
            aria-label={`View vehicle details for ${vehicle.registration_number}`}
          />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">{vehicle.registration_number}</h2>
              <p className="text-sm text-gray-600">
                {vehicle.make ? `${vehicle.make} ${vehicle.model ?? ''}`.trim() : 'Make/model unavailable'}
              </p>
            </div>
            <div className="text-right text-sm">
              <Link href={`/customer/vehicles/${vehicle.id}`} className="relative z-10 text-brand-red underline">
                View details
              </Link>
            </div>
          </div>
        </Card>
      ))}
    </main>
  );
}
