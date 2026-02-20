import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle } from '@/lib/routes';
import { groupVehicleDocuments, VehicleDocumentsGroups } from '@/components/customer/vehicle-documents-groups';
import { PageHeader } from '@/components/layout/page-header';
import { RetryButton } from '@/components/ui/retry-button';
import { EmptyState } from '@/components/ui/empty-state';

export default async function VehicleDocumentsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  if (!vehicleId) {
    return <main><EmptyState title="Vehicle unavailable" description="Vehicle id is missing from this request." /></main>;
  }

  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();

  if (!context) {
    return <main><EmptyState title="Vehicle unavailable" description="Vehicle not found or you do not have access." /></main>;
  }

  const customerAccountId = context.customer_account.id;

  const [{ data: vehicle, error: vehicleError }, docsResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number')
      .eq('id', vehicleId)
      .eq('current_customer_account_id', customerAccountId)
      .maybeSingle(),
    supabase
      .from('vehicle_documents')
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
  ]);

  if (vehicleError || !vehicle) {
    return <main><EmptyState title="Vehicle unavailable" description="Vehicle not found or you do not have access." /></main>;
  }

  if (docsResult.error) {
    console.error('Customer documents fetch failed', docsResult.error);
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

  const docs = Array.isArray(docsResult.data) ? docsResult.data : [];
  const groups = groupVehicleDocuments(docs);

  return (
    <main className="space-y-4">
      <PageHeader title="Documents" subtitle={`${vehicle.registration_number} · Organized by type`} actions={<Button asChild variant="secondary" size="sm"><Link href={customerVehicle(vehicleId)}>Back to vehicle</Link></Button>} />
      {!docs.length ? <EmptyState title="No documents yet" description="Your workshop has not uploaded documents for this vehicle yet." /> : null}
      <VehicleDocumentsGroups groups={groups} />
    </main>
  );
}
