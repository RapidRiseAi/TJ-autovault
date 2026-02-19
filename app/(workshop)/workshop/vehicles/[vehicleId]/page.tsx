import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { HeroHeader } from '@/components/layout/hero-header';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { WorkshopVehicleActionsPanel } from '@/components/workshop/workshop-vehicle-actions-panel';
import { SectionCard } from '@/components/ui/section-card';
import { SegmentRing } from '@/components/ui/segment-ring';
import { MetricCard } from '@/components/workshop/metric-card';

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
  const unpaidInvoiceCount = invoices.filter((x) => x.payment_status !== 'paid').length;

  return (
    <main className="space-y-4">
      <HeroHeader
        title={vehicle.registration_number}
        subtitle={`${vehicle.make ?? ''} ${vehicle.model ?? ''} ${vehicle.year ? `(${vehicle.year})` : ''}`}
        media={vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt="Vehicle" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="h-20 w-20 rounded-2xl bg-white/10" />}
        meta={<><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">Mileage {vehicle.odometer_km ?? 'N/A'} km</span><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">Status {vehicle.status ?? 'pending'}</span></>}
        actions={<><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/timeline`}>View full timeline</Link></Button><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/documents`}>View documents</Link></Button>{pendingVerification ? <VerifyVehicleButton vehicleId={vehicle.id} /> : null}</>}
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <MetricCard label="Revenue collected" value={money(paidTotal)} support="Paid invoices" />
        <MetricCard
          label="Outstanding balance"
          value={money(unpaidTotal)}
          support="Unpaid invoices"
          visual={
            <SegmentRing
              size={72}
              centerLabel={String(unpaidInvoiceCount)}
              subLabel="Unpaid"
              total={Math.max(invoices.length, 1)}
              segments={[{ value: unpaidInvoiceCount, tone: 'negative' }]}
            />
          }
        />
        <MetricCard label="Open work requests" value={openRequests || 0} support="Active requests" action={<Button asChild size="sm" variant="secondary"><Link href="/workshop/work-requests">View requests</Link></Button>} />
        <MetricCard label="Reports needing attention" value={attentionReports || 0} support="Urgent/high docs" action={<Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/documents`}>View reports</Link></Button>} />
        <MetricCard label="Verification status" value={pendingVerification ? 'Pending' : 'Verified'} support={pendingVerification ? 'Awaiting workshop verification' : 'Verified by workshop'} />
      </section>

      <SectionCard className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Quick actions</h2>
        <WorkshopVehicleActionsPanel vehicleId={vehicle.id} invoices={(invoicesResult.data ?? []).map((invoice) => ({ id: invoice.id }))} jobs={(jobsResult.data ?? []).map((job) => ({ id: job.id }))} workRequests={(workRequestsResult.data ?? []).map((request) => ({ id: request.id, status: request.status }))} />
      </SectionCard>
    </main>
  );
}
