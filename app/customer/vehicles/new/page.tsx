import { notFound } from 'next/navigation';
import { AddVehicleForm } from '@/components/customer/add-vehicle-form';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';

export default async function NewCustomerVehiclePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) notFound();

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Add vehicle</h1>
      <Card>
        <AddVehicleForm />
      </Card>
    </main>
  );
}
