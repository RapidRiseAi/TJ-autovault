import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { customerVehicle } from '@/lib/routes';
import { groupVehicleDocuments, VehicleDocumentsGroups } from '@/components/customer/vehicle-documents-groups';
import { PageHeader } from '@/components/layout/page-header';

export default async function VehicleDocumentsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
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
  const [{ data: vehicle }, { data: docs }] = await Promise.all([
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

  if (!vehicle) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
          <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        </Card>
      </main>
    );
  }

  const groups = groupVehicleDocuments(docs ?? []);

  return (
    <main className="space-y-4">
      <PageHeader title="Documents" subtitle={`${vehicle.registration_number} · Organized by type`} actions={<Button asChild variant="secondary" size="sm"><Link href={customerVehicle(vehicleId)}>Back to vehicle</Link></Button>} />

      <VehicleDocumentsGroups groups={groups} />
    </main>
  );
}
