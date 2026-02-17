import { redirect } from 'next/navigation';
import { AddVehicleForm } from '@/components/customer/add-vehicle-form';
import { Card } from '@/components/ui/card';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

export default async function NewCustomerVehiclePage() {
  const context = await getCustomerContextOrCreate();

  if (!context) redirect('/login');

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Add vehicle</h1>
      <Card>
        <AddVehicleForm />
      </Card>
    </main>
  );
}
