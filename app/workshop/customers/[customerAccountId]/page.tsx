import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { SendMessageModal } from '@/components/messages/send-message-modal';

function statusTone(status: string | null) {
  const normalized = (status ?? 'pending').toLowerCase();
  if (normalized.includes('pending')) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (normalized.includes('verified') || normalized.includes('active')) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-black/10 bg-gray-50 text-gray-700';
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

  const [{ data: vehicles }, { count: unpaidInvoices }, { count: pendingQuotes }, { count: activeJobs }] = await Promise.all([
    supabase.from('vehicles').select('id,registration_number,status,primary_image_path').eq('current_customer_account_id', customerAccountId).eq('workshop_account_id', workshopId),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).neq('payment_status', 'paid'),
    supabase.from('quotes').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).in('status', ['sent', 'pending']),
    supabase.from('service_jobs').select('id', { count: 'exact', head: true }).eq('customer_account_id', customerAccountId).in('status', ['open', 'awaiting_approval', 'in_progress'])
  ]);

  return (
    <main className="space-y-4">
      <PageHeader title={customerDisplayName} subtitle={`Customer account: ${customer.name}`} actions={<SendMessageModal vehicles={(vehicles ?? []).map((vehicle) => ({ id: vehicle.id, registration_number: vehicle.registration_number }))} customers={[{ id: customer.id, name: customerDisplayName }]} defaultCustomerId={customer.id} />} />
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Vehicles', vehicles?.length ?? 0],
          ['Pending quotes', pendingQuotes ?? 0],
          ['Unpaid invoices', unpaidInvoices ?? 0],
          ['Open requests', activeJobs ?? 0]
        ].map(([label, value]) => (
          <Card key={label as string} className="rounded-3xl p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-semibold">{value as number}</p></Card>
        ))}
      </div>

      <Card className="rounded-3xl">
        <h2 className="mb-3 text-base font-semibold">Vehicles</h2>
        {!vehicles?.length ? <p className="text-sm text-gray-500">No vehicles linked to this customer.</p> : (
          <div className="space-y-2">
            {vehicles.map((vehicle) => {
              const pending = (vehicle.status ?? '').toLowerCase().includes('pending');
              return (
                <div key={vehicle.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-3">
                  <div className="flex items-center gap-3">
                    {vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt={vehicle.registration_number} className="h-12 w-12 rounded-xl object-cover" /> : <div className="h-12 w-12 rounded-xl bg-stone-100" />}
                    <div>
                      <p className="text-sm font-semibold">{vehicle.registration_number}</p>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusTone(vehicle.status)}`}>{vehicle.status ?? 'pending'}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    {pending ? <VerifyVehicleButton vehicleId={vehicle.id} /> : null}
                    <Button asChild size="sm" variant="outline"><Link href={`/workshop/vehicles/${vehicle.id}`}>Open vehicle</Link></Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </main>
  );
}
