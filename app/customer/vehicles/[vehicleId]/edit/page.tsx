import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { EditVehicleForm } from '@/components/customer/edit-vehicle-form';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { PageHeader } from '@/components/layout/page-header';

export default async function CustomerVehicleEditPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const context = await getCustomerContextOrCreate();
  if (!context) redirect('/login');

  const supabase = await createClient();
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,vin,odometer_km')
    .eq('id', vehicleId)
    .eq('current_customer_account_id', context.customer_account.id)
    .maybeSingle();

  if (!vehicle) redirect('/customer/dashboard');

  return (
    <main className="space-y-4">
      <PageHeader title="Edit vehicle" subtitle={`Update ${vehicle.registration_number}.`} />
      <Card>
        <EditVehicleForm vehicle={vehicle} />
      </Card>
    </main>
  );
}
