import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { VehicleDocumentsGroups } from '@/components/customer/vehicle-documents-groups';
import { groupVehicleDocuments } from '@/lib/vehicle-documents';
import { PageHeader } from '@/components/layout/page-header';
import { RetryButton } from '@/components/ui/retry-button';
import { EmptyState } from '@/components/ui/empty-state';

export default async function WorkshopVehicleDocumentsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  if (!vehicleId) {
    return <main><EmptyState title="Vehicle unavailable" description="Vehicle id is missing from this request." /></main>;
  }

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return <main><EmptyState title="Vehicle unavailable" description="Vehicle not found or you do not have access." /></main>;
  }

  const workshopId = profile.workshop_account_id;

  const [{ data: vehicle, error: vehicleError }, docsResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number')
      .eq('id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
    supabase
      .from('vehicle_documents')
      .select('id,created_at,document_type,original_name,subject,storage_bucket,storage_path,importance')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false })
  ]);

  if (vehicleError || !vehicle) {
    return <main><EmptyState title="Vehicle unavailable" description="Vehicle not found or you do not have access." /></main>;
  }

  if (docsResult.error) {
    console.error('Workshop documents fetch failed', docsResult.error);
    return (
      <main className="space-y-4">
        <PageHeader
          title="Documents"
          subtitle={`${vehicle.registration_number} · Organized by type`}
          actions={<Button asChild variant="secondary" size="sm"><Link href={`/workshop/vehicles/${vehicleId}`}>Back to vehicle</Link></Button>}
        />
        <Card className="space-y-3">
          <p className="text-sm text-gray-700">Unable to load documents right now.</p>
          <RetryButton />
        </Card>
      </main>
    );
  }

  const docs = Array.isArray(docsResult.data) ? docsResult.data : [];
  const groups = groupVehicleDocuments(docs);

  return (
    <main className="space-y-4">
      <PageHeader
        title="Documents"
        subtitle={`${vehicle.registration_number} · Organized by type`}
        actions={<Button asChild variant="secondary" size="sm"><Link href={`/workshop/vehicles/${vehicleId}`}>Back to vehicle</Link></Button>}
      />
      {!docs.length ? <EmptyState title="No documents yet" description="Upload documents to keep this vehicle history complete." /> : null}
      <VehicleDocumentsGroups groups={groups} />
    </main>
  );
}
