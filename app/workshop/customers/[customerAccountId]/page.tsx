import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { SendMessageModal } from '@/components/messages/send-message-modal';
import { CustomerVehicleManager } from '@/components/workshop/customer-vehicle-manager';

type CustomerVehicleRow = {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometer_km: number | null;
  status: string | null;
  notes: string | null;
  primary_image_path: string | null;
};

async function loadCustomerVehicles({
  supabase,
  customerAccountId,
  workshopId
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  customerAccountId: string;
  workshopId: string;
}): Promise<{ vehicles: CustomerVehicleRow[]; error: string | null }> {
  const withNotes = await supabase
    .from('vehicles')
    .select('id,registration_number,make,model,year,vin,odometer_km,status,notes,primary_image_path')
    .eq('current_customer_account_id', customerAccountId)
    .eq('workshop_account_id', workshopId);

  if (!withNotes.error) {
    return { vehicles: (withNotes.data ?? []) as CustomerVehicleRow[], error: null };
  }

  if (withNotes.error.code === 'PGRST204' && withNotes.error.message.includes("'notes' column")) {
    const withoutNotes = await supabase
      .from('vehicles')
      .select('id,registration_number,make,model,year,vin,odometer_km,status,primary_image_path')
      .eq('current_customer_account_id', customerAccountId)
      .eq('workshop_account_id', workshopId);

    if (!withoutNotes.error) {
      return {
        vehicles: (withoutNotes.data ?? []).map((vehicle) => ({ ...vehicle, notes: null })) as CustomerVehicleRow[],
        error: null
      };
    }

    return { vehicles: [], error: withoutNotes.error.message };
  }

  return { vehicles: [], error: withNotes.error.message };
}

export default async function WorkshopCustomerPage({ params }: { params: Promise<{ customerAccountId: string }> }) {
  const { customerAccountId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const { data: customer } = await supabase
    .from('customer_accounts')
    .select('id,name,customer_users(profile_id,profiles(display_name,avatar_url))')
    .eq('id', customerAccountId)
    .eq('workshop_account_id', workshopId)
    .single();
  if (!customer) notFound();

  const customerDisplayName = customer.customer_users?.[0]?.profiles?.[0]?.display_name || customer.name;

  const [{ vehicles, error: vehiclesError }, { count: unpaidInvoices }, { count: pendingQuotes }, { count: activeJobs }] = await Promise.all([
    loadCustomerVehicles({ supabase, customerAccountId, workshopId }),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).in('status', ['sent', 'pending']),
    supabase.from('service_jobs').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).in('status', ['open', 'awaiting_approval', 'in_progress'])
  ]);

  return (
    <main className="space-y-4">
      <PageHeader title={customerDisplayName} subtitle={`Customer account: ${customer.name}`} actions={<SendMessageModal vehicles={vehicles.map((vehicle) => ({ id: vehicle.id, registration_number: vehicle.registration_number }))} customers={[{ id: customer.id, name: customerDisplayName }]} defaultCustomerId={customer.id} />} />
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Vehicles', vehicles.length],
          ['Pending quotes', pendingQuotes ?? 0],
          ['Unpaid invoices', unpaidInvoices ?? 0],
          ['Open requests', activeJobs ?? 0]
        ].map(([label, value]) => (
          <Card key={label as string} className="rounded-3xl p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value as number}</p></Card>
        ))}
      </div>

      <Card className="rounded-3xl">
        {vehiclesError ? <p className="px-6 pt-6 text-sm text-red-700">Could not load linked vehicles: {vehiclesError}</p> : null}
        <CustomerVehicleManager customerAccountId={customer.id} vehicles={vehicles} />
      </Card>
    </main>
  );
}
