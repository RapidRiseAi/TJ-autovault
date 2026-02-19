import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { groupVehicleDocuments, VehicleDocumentsGroups } from '@/components/customer/vehicle-documents-groups';
import { PageHeader } from '@/components/layout/page-header';
import { RetryButton } from '@/components/ui/retry-button';

export default async function WorkshopVehicleDocumentsPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  if (!vehicleId) return <main><Card><h1 className="text-xl font-semibold">Vehicle unavailable</h1></Card></main>;

  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) {
    return (
      <main className="space-y-4">
        <Card>
          <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
          <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        </Card>
      </main>
    );
  }

  const workshopId = profile.workshop_account_id;

  try {
    const [{ data: vehicle }, docsResult] = await Promise.all([
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
        {!docs.length ? <Card><p className="text-sm text-gray-600">No documents available for this vehicle yet.</p></Card> : null}
        <VehicleDocumentsGroups groups={groups} />
      </main>
    );
  } catch (error) {
    console.error('Workshop documents page crashed', error);
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
