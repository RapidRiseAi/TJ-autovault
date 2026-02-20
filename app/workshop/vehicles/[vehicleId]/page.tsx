import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { SendMessageModal } from '@/components/messages/send-message-modal';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { WorkshopVehicleActionsPanel } from '@/components/workshop/workshop-vehicle-actions-panel';
import { createClient } from '@/lib/supabase/server';

export default async function WorkshopVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).maybeSingle();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [{ data: vehicle }, { data: invoices }, { data: jobs }, { data: workRequests }, { data: customers }] = await Promise.all([
    supabase.from('vehicles').select('id,registration_number,make,model,status,odometer_km,current_customer_account_id').eq('id', vehicleId).eq('workshop_account_id', workshopId).maybeSingle(),
    supabase.from('invoices').select('id,invoice_number,payment_status,total_cents').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId).order('created_at', { ascending: false }),
    supabase.from('service_jobs').select('id').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId).order('created_at', { ascending: false }),
    supabase.from('work_requests').select('id,status').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId).order('created_at', { ascending: false }),
    supabase.from('customer_accounts').select('id,name').eq('workshop_account_id', workshopId).order('name', { ascending: true })
  ]);

  if (!vehicle) notFound();

  return (
    <main className="space-y-4">
      <PageHeader
        title={vehicle.registration_number}
        subtitle={`${vehicle.make ?? 'Unknown make'} ${vehicle.model ?? ''}`}
        actions={
          <div className="flex gap-2">
            <SendMessageModal
              vehicles={[{ id: vehicle.id, registration_number: vehicle.registration_number }]}
              defaultVehicleId={vehicle.id}
              customers={(customers ?? []).map((customer) => ({ id: customer.id, name: customer.name }))}
              defaultCustomerId={vehicle.current_customer_account_id}
            />
            <Button asChild variant="secondary"><Link href="/workshop/dashboard">Back to dashboard</Link></Button>
          </div>
        }
      />

      <Card className="rounded-2xl p-4">
        <p className="text-xs uppercase tracking-wide text-gray-500">Status</p>
        <p className="text-sm font-semibold">{vehicle.status ?? 'active'}</p>
      </Card>

      <WorkshopVehicleActionsPanel
        vehicleId={vehicle.id}
        invoices={(invoices ?? []).map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoice_number, paymentStatus: invoice.payment_status, totalCents: invoice.total_cents }))}
        jobs={jobs ?? []}
        workRequests={(workRequests ?? []).map((request) => ({ id: request.id, status: request.status ?? 'requested' }))}
        currentMileage={vehicle.odometer_km ?? 0}
        uploadDestinationLabel={vehicle.registration_number}
      />
    </main>
  );
}
