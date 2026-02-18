import { redirect } from 'next/navigation';
import { AddVehicleForm } from '@/components/customer/add-vehicle-form';
import { Card } from '@/components/ui/card';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { PageHeader } from '@/components/layout/page-header';

export default async function NewCustomerVehiclePage() {
  const context = await getCustomerContextOrCreate();
  if (!context) redirect('/login');

  return (
    <main className="space-y-4">
      <PageHeader title="Add vehicle" subtitle="Register a vehicle to start service tracking." />
      <Card>
        <AddVehicleForm />
      </Card>
    </main>
  );
}
