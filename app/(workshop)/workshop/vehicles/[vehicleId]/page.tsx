import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BadgeCheck,
  BadgeDollarSign,
  ClipboardList,
  FileWarning,
  ReceiptText,
  TriangleAlert
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { HeroHeader } from '@/components/layout/hero-header';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { WorkshopVehicleActionsPanel } from '@/components/workshop/workshop-vehicle-actions-panel';
import { SectionCard } from '@/components/ui/section-card';

function money(cents: number) {
  return new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format((cents ?? 0) / 100);
}

function StatTile({
  label,
  value,
  subtext,
  icon,
  badge
}: {
  label: string;
  value: string | number;
  subtext: string;
  icon: ReactNode;
  badge?: string;
}) {
  return (
    <div className="relative flex h-full flex-col rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_12px_24px_rgba(17,17,17,0.06)]">
      {badge ? <span className="absolute right-4 top-4 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">{badge}</span> : null}
      <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">{icon}</span>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-neutral-900">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{subtext}</p>
    </div>
  );
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
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,year,odometer_km,workshop_account_id,primary_image_path,status')
      .eq('id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
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
        <StatTile label="Revenue collected" value={money(paidTotal)} subtext="Paid invoices" icon={<BadgeDollarSign className="h-4 w-4" />} />
        <StatTile label="Outstanding balance" value={money(unpaidTotal)} subtext="Unpaid invoices" icon={<ReceiptText className="h-4 w-4" />} badge={unpaidInvoiceCount > 0 ? `${unpaidInvoiceCount} unpaid` : undefined} />
        <StatTile label="Open work requests" value={openRequests || 0} subtext="Active requests" icon={<ClipboardList className="h-4 w-4" />} />
        <StatTile label="Reports needing attention" value={attentionReports || 0} subtext="Urgent/high docs" icon={<FileWarning className="h-4 w-4" />} />
        <StatTile label="Verification status" value={pendingVerification ? 'Pending' : 'Verified'} subtext={pendingVerification ? 'Awaiting workshop verification' : 'Verified by workshop'} icon={pendingVerification ? <TriangleAlert className="h-4 w-4" /> : <BadgeCheck className="h-4 w-4" />} />
      </section>

      <SectionCard className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-[0_18px_40px_rgba(17,17,17,0.09)]">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Quick actions</h2>
          <p className="text-sm text-gray-500">Run common workshop updates without leaving this page.</p>
        </div>
        <div className="rounded-xl bg-neutral-50 p-4">
          <WorkshopVehicleActionsPanel vehicleId={vehicle.id} invoices={(invoicesResult.data ?? []).map((invoice) => ({ id: invoice.id }))} jobs={(jobsResult.data ?? []).map((job) => ({ id: job.id }))} workRequests={(workRequestsResult.data ?? []).map((request) => ({ id: request.id, status: request.status }))} />
        </div>
      </SectionCard>
    </main>
  );
}
