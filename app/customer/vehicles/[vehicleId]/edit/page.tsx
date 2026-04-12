import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { EditVehicleForm } from '@/components/customer/edit-vehicle-form';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { PageHeader } from '@/components/layout/page-header';
import { getTemporaryVehicleLimitByTier, isVehicleVisibleForCustomer } from '@/lib/customer/temporary-vehicles';

export default async function CustomerVehicleEditPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const context = await getCustomerContextOrCreate();
  if (!context) redirect('/login');

  const supabase = await createClient();
  const [{ data: vehicle }, { data: account }, { data: allVehicles }] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,year,vin,odometer_km,is_temporary,archived_at')
      .eq('id', vehicleId)
      .eq('current_customer_account_id', context.customer_account.id)
      .maybeSingle(),
    supabase
      .from('customer_accounts')
      .select('tier,temporary_vehicle_limit')
      .eq('id', context.customer_account.id)
      .maybeSingle(),
    supabase
      .from('vehicles')
      .select('id,is_temporary,archived_at')
      .eq('current_customer_account_id', context.customer_account.id)
  ]);

  if (!vehicle) redirect('/customer/dashboard');
  const temporaryLimit = Number(
    account?.temporary_vehicle_limit ?? getTemporaryVehicleLimitByTier(account?.tier)
  );
  if (!isVehicleVisibleForCustomer(vehicle, allVehicles ?? [], temporaryLimit)) {
    redirect('/customer/dashboard');
  }

  return (
    <main className="space-y-4">
      <PageHeader title="Edit vehicle" subtitle={`Update ${vehicle.registration_number}.`} />
      <Card>
        <EditVehicleForm vehicle={vehicle} />
      </Card>
    </main>
  );
}
