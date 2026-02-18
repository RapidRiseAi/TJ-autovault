import Link from 'next/link';
import { CustomerVehicleDetailView } from '@/components/customer/customer-vehicle-detail-view';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { customerDashboard, customerVehicleDocuments, customerVehicleTimeline } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { PageHeader } from '@/components/layout/page-header';

function VehicleAccessErrorPanel() {
  return (
    <main className="space-y-4">
      <Card>
        <h1 className="text-xl font-semibold">Vehicle unavailable</h1>
        <p className="text-sm text-gray-700">Vehicle not found or you don&apos;t have access.</p>
        <Button asChild size="sm" variant="secondary" className="mt-3">
          <Link href={customerDashboard()}>Back to dashboard</Link>
        </Button>
      </Card>
    </main>
  );
}

export default async function VehicleDetailPage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return <VehicleAccessErrorPanel />;

  const customerAccountId = context.customer_account.id;
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,odometer_km,status,next_service_km,next_service_date,primary_image_path')
    .eq('id', vehicleId)
    .eq('current_customer_account_id', customerAccountId)
    .maybeSingle();

  if (!vehicle) return <VehicleAccessErrorPanel />;

  const [{ data: quotes }, { data: invoices }, { data: requests }, { data: recommendations }, { data: docs }] = await Promise.all([
    supabase
      .from('quotes')
      .select('id,status,total_cents')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('invoices')
      .select('id,status,payment_status,total_cents,due_date')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('work_requests')
      .select('id,request_type,status')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('recommendations')
      .select('id,title,description,severity,status,status_text')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false }),
    supabase
      .from('vehicle_documents')
      .select('id,storage_bucket,storage_path,original_name,created_at,document_type,subject,importance')
      .eq('vehicle_id', vehicleId)
      .eq('customer_account_id', customerAccountId)
      .order('created_at', { ascending: false })
  ]);

  const attachments = (docs ?? []).map((d) => ({
    id: d.id,
    bucket: d.storage_bucket,
    storage_path: d.storage_path,
    original_name: d.original_name,
    created_at: d.created_at,
    document_type: d.document_type,
    subject: d.subject,
    importance: d.importance
  }));

  return (
    <main className="space-y-4">
      <PageHeader title={`Vehicle · ${vehicle.registration_number}`} subtitle="Service activity, actions, and records in one place." />
      <CustomerVehicleDetailView
        vehicle={vehicle}
        timeline={[]}
        quotes={quotes ?? []}
        invoices={invoices ?? []}
        requests={requests ?? []}
        recommendations={recommendations ?? []}
        attachments={attachments}
        timelineHref={customerVehicleTimeline(vehicle.id)}
        documentsHref={customerVehicleDocuments(vehicle.id)}
        editHref={`/customer/vehicles/${vehicle.id}/edit`}
        dashboardHref={customerDashboard()}
      />
    </main>
  );
}
