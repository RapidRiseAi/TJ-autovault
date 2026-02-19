import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle } from '@/lib/routes';
import { groupVehicleDocuments, VehicleDocumentsGroups } from '@/components/customer/vehicle-documents-groups';
import { PageHeader } from '@/components/layout/page-header';
import { RetryButton } from '@/components/ui/retry-button';

export default async function VehicleDocumentsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  if (!vehicleId) {
    return <main><Card><h1 className="text-xl font-semibold">Vehicle unavailable</h1></Card></main>;
  }

  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();

  if (!context) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
          <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        </Card>
      </main>
    );
  }

  const customerAccountId = context.customer_account.id;

  try {
    const [{ data: vehicle, error: vehicleError }, { data: docs, error: docsError }] = await Promise.all([
      supabase.from('vehicles').select('id,registration_number').eq('id', vehicleId).eq('current_customer_account_id', customerAccountId).maybeSingle(),
      supabase.from('vehicle_documents').select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance').eq('vehicle_id', vehicleId).eq('customer_account_id', customerAccountId).order('created_at', { ascending: false })
    ]);

    if (vehicleError || !vehicle) {
      return (
        <main className="space-y-4">
          <Card>
            <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
            <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
          </Card>
        </main>
      );
    }

    if (docsError) {
      console.error('Customer documents fetch failed', docsError);
      return (
        <main className="space-y-4">
          <PageHeader title="Documents" subtitle={`${vehicle.registration_number} · Organized by type`} actions={<Button asChild variant="secondary" size="sm"><Link href={customerVehicle(vehicleId)}>Back to vehicle</Link></Button>} />
          <Card className="space-y-3">
            <p className="text-sm text-gray-600">We could not load documents right now. Please try again.</p>
            <RetryButton />
          </Card>
        </main>
      );
    }

    const groups = groupVehicleDocuments(docs ?? []);

    return (
      <main className="space-y-4">
        <PageHeader title="Documents" subtitle={`${vehicle.registration_number} · Organized by type`} actions={<Button asChild variant="secondary" size="sm"><Link href={customerVehicle(vehicleId)}>Back to vehicle</Link></Button>} />
        {!docs?.length ? <Card><p className="text-sm text-gray-600">No documents available for this vehicle yet.</p></Card> : null}
        <VehicleDocumentsGroups groups={groups} />
      </main>
    );
  } catch (error) {
    console.error('Customer documents page crashed', error);
    return (
      <main className="space-y-4">
        <Card className="space-y-3">
          <h1 className="text-xl font-semibold">Unable to render documents</h1>
          <p className="text-sm text-gray-600">Please retry. If the issue continues, contact support.</p>
          <RetryButton />
        </Card>
      </main>
    );
  }
}
