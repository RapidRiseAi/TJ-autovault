import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

export default async function CustomerVehiclesPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const context = await getCustomerContextOrCreate();
  const customerAccountId = context?.customer_account?.id;

  const { data: vehicles } = customerAccountId
    ? await supabase
        .from('vehicles')
        .select('id,registration_number,make,model,year,status')
        .eq('current_customer_account_id', customerAccountId)
        .order('registration_number', { ascending: true })
    : { data: [] };

  return (
    <main className="space-y-4">
      <PageHeader
        title="Vehicles"
        subtitle="Open a vehicle or add a new one from here."
        actions={<Button asChild><Link href="/customer/vehicles/new">Add vehicle</Link></Button>}
      />
      <div className="grid gap-3">
        {(vehicles ?? []).map((vehicle) => (
          <Card key={vehicle.id} className="rounded-2xl p-4">
            <p className="text-lg font-semibold text-black">{vehicle.registration_number}</p>
            <p className="text-sm text-gray-600">
              {vehicle.make ?? 'Unknown make'} {vehicle.model ?? ''} {vehicle.year ? `(${vehicle.year})` : ''}
            </p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="rounded-full border border-black/10 px-2.5 py-1 text-xs capitalize text-gray-600">
                {vehicle.status ?? 'pending'}
              </span>
              <Button asChild size="sm" variant="secondary">
                <Link href={`/customer/vehicles/${vehicle.id}`}>Open</Link>
              </Button>
            </div>
          </Card>
        ))}
        {(vehicles ?? []).length === 0 ? (
          <Card className="rounded-2xl p-5 text-sm text-gray-600">
            No vehicles yet. Add your first vehicle to get started.
          </Card>
        ) : null}
      </div>
    </main>
  );
}
