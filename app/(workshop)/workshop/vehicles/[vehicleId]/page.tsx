import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { HeroHeader } from '@/components/layout/hero-header';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { WorkshopVehicleActionsPanel } from '@/components/workshop/workshop-vehicle-actions-panel';

function money(cents: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format((cents ?? 0) / 100);
}

export default async function WorkshopVehiclePage({ params }: { params: Promise<{ vehicleId: string }> }) {
  const { vehicleId } = await params;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [vehicleResult, jobsResult, invoicesResult, docsResult, workRequestsResult] = await Promise.all([
    supabase.from('vehicles').select('id,registration_number,make,model,year,odometer_km,workshop_account_id,primary_image_path,status').eq('id', vehicleId).eq('workshop_account_id', workshopId).maybeSingle(),
    supabase.from('service_jobs').select('id,status').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('invoices').select('id,payment_status,total_cents').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('vehicle_documents').select('id,importance').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('work_requests').select('id,status').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId)
  ]);

  const vehicle = vehicleResult.data;
  if (!vehicle) return <main><Card><h1 className="text-xl font-semibold">Vehicle not found</h1></Card></main>;

  const invoices = invoicesResult.data ?? [];
  const paidTotal = invoices.filter((x) => x.payment_status === 'paid').reduce((sum, x) => sum + (x.total_cents ?? 0), 0);
  const unpaidTotal = invoices.filter((x) => x.payment_status !== 'paid').reduce((sum, x) => sum + (x.total_cents ?? 0), 0);
  const openRequests = (workRequestsResult.data ?? []).filter((x) => !['completed', 'delivered', 'cancelled'].includes(x.status)).length;
  const attentionReports = (docsResult.data ?? []).filter((x) => (x.importance ?? '').toLowerCase() === 'high' || (x.importance ?? '').toLowerCase() === 'urgent').length;
  const pendingVerification = (vehicle.status ?? '').toLowerCase().includes('pending');

  return (
    <main className="space-y-4">
      <HeroHeader
        title={vehicle.registration_number}
        subtitle={`${vehicle.make ?? ''} ${vehicle.model ?? ''} ${vehicle.year ? `(${vehicle.year})` : ''}`}
        media={vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt="Vehicle" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="h-20 w-20 rounded-2xl bg-white/10" />}
        meta={<><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">Mileage {vehicle.odometer_km ?? 'N/A'} km</span><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">Status {vehicle.status ?? 'pending'}</span></>}
        actions={<><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/timeline`}>View full timeline</Link></Button><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/documents`}>View documents</Link></Button>{pendingVerification ? <VerifyVehicleButton vehicleId={vehicle.id} /> : null}</>}
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Card className="rounded-3xl p-4"><p className="text-xs text-gray-500">Revenue collected</p><p className="mt-1 text-2xl font-semibold">{money(paidTotal)}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-gray-500">Outstanding balance</p><p className="mt-1 text-2xl font-semibold">{money(unpaidTotal)}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-gray-500">Open work requests</p><p className="mt-1 text-2xl font-semibold">{openRequests}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-gray-500">Reports needing attention</p><p className="mt-1 text-2xl font-semibold">{attentionReports}</p></Card>
        <Card className="rounded-3xl p-4"><p className="text-xs text-gray-500">Verification</p><p className="mt-1 text-2xl font-semibold">{pendingVerification ? 'Pending' : 'Verified'}</p></Card>
      </section>

      <Card className="rounded-3xl">
        <h2 className="mb-3 text-base font-semibold">Actions</h2>
        <WorkshopVehicleActionsPanel vehicleId={vehicle.id} invoices={(invoicesResult.data ?? []).map((invoice) => ({ id: invoice.id }))} jobs={(jobsResult.data ?? []).map((job) => ({ id: job.id }))} workRequests={(workRequestsResult.data ?? []).map((request) => ({ id: request.id, status: request.status }))} />
      </Card>
    </main>
  );
}

