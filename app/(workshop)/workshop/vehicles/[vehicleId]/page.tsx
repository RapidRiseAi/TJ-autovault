import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BadgeDollarSign,
  ClipboardList,
  FileWarning,
  ReceiptText,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { HeroHeader } from '@/components/layout/hero-header';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { WorkshopVehicleActionsPanel } from '@/components/workshop/workshop-vehicle-actions-panel';
import { VehicleJobCardPanel } from '@/components/workshop/vehicle-job-card-panel';
import { SectionCard } from '@/components/ui/section-card';
import { SendMessageModal } from '@/components/messages/send-message-modal';

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

export default async function WorkshopVehiclePage({
  params,
  searchParams
}: {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ quoteRecommendationId?: string }>;
}) {
  const { vehicleId } = await params;
  const { quoteRecommendationId } = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role,workshop_account_id').eq('id', user.id).single();
  if (!profile?.workshop_account_id || (profile.role !== 'admin' && profile.role !== 'technician')) redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [vehicleResult, jobsResult, invoicesResult, docsResult, workRequestsResult, customersResult, recommendationsResult, activeJobResult, techniciansResult] = await Promise.all([
    supabase
      .from('vehicles')
      .select('id,registration_number,make,model,year,odometer_km,workshop_account_id,primary_image_path,status,current_customer_account_id')
      .eq('id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
    supabase.from('service_jobs').select('id,status').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('invoices').select('id,payment_status,total_cents,invoice_number').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('vehicle_documents').select('id,importance').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('work_requests').select('id,status').eq('vehicle_id', vehicleId).eq('workshop_account_id', workshopId),
    supabase.from('customer_accounts').select('id,name').eq('workshop_account_id', workshopId).order('name', { ascending: true }),
    supabase
      .from('recommendations')
      .select('id,title,status,description,created_at')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),

    supabase
      .from('job_cards')
      .select('id,title,status,started_at,last_updated_at,job_card_assignments(id,technician_user_id,profiles(display_name,full_name,avatar_url))')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_id', workshopId)
      .in('status', ['not_started', 'in_progress', 'waiting_parts', 'waiting_approval', 'quality_check', 'ready'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workshop_users')
      .select('profile_id,profiles(display_name,full_name)')
      .eq('workshop_account_id', workshopId),
  ]);

  const vehicle = vehicleResult.data;
  if (!vehicle) return <main><Card><h1 className="text-xl font-semibold">Vehicle not found</h1></Card></main>;


  const { data: customerAccount } = vehicle.current_customer_account_id
    ? await supabase
        .from('customer_accounts')
        .select('name')
        .eq('id', vehicle.current_customer_account_id)
        .maybeSingle()
    : { data: null };

  const customerName = customerAccount?.name?.trim() || 'Customer';
  const vehicleLabel = `${vehicle.make?.trim() || 'Vehicle'} ${vehicle.model?.trim() || ''}`.trim();
  const uploadDestinationLabel = `${customerName} • ${vehicleLabel} timeline`;
  const invoices = invoicesResult.data ?? [];
  const paidTotal = invoices.filter((x) => x.payment_status === 'paid').reduce((sum, x) => sum + (x.total_cents ?? 0), 0);
  const unpaidTotal = invoices.filter((x) => x.payment_status !== 'paid').reduce((sum, x) => sum + (x.total_cents ?? 0), 0);
  const openRequests = (workRequestsResult.data ?? []).filter((x) => !['completed', 'delivered', 'cancelled'].includes(x.status)).length;
  const attentionReports = (docsResult.data ?? []).filter((x) => (x.importance ?? '').toLowerCase() === 'high' || (x.importance ?? '').toLowerCase() === 'urgent').length;
  const pendingVerification = (vehicle.status ?? '').toLowerCase().includes('pending');
  const activeJobRaw = activeJobResult.data;
  const activeJob = activeJobRaw ? {
    id: activeJobRaw.id,
    title: activeJobRaw.title,
    status: activeJobRaw.status,
    started_at: activeJobRaw.started_at,
    last_updated_at: activeJobRaw.last_updated_at,
    assignments: (activeJobRaw.job_card_assignments ?? []).map((assignment: { id: string; profiles: { display_name: string | null; full_name: string | null; avatar_url: string | null }[] | null }) => ({
      id: assignment.id,
      name: assignment.profiles?.[0]?.display_name ?? assignment.profiles?.[0]?.full_name ?? 'Technician',
      avatarUrl: assignment.profiles?.[0]?.avatar_url ?? null
    }))
  } : null;
  const technicians = (techniciansResult.data ?? []).map((row: { profile_id: string; profiles: { display_name: string | null; full_name: string | null }[] | null }) => ({ id: row.profile_id, name: row.profiles?.[0]?.display_name ?? row.profiles?.[0]?.full_name ?? 'Technician' }));
  const unpaidInvoiceCount = invoices.filter((x) => x.payment_status !== 'paid').length;
  const recommendations = recommendationsResult.data ?? [];
  const approvedRecommendations = recommendations.filter((recommendation) => (recommendation.status ?? '').toLowerCase() === 'approved');
  const selectedApprovedRecommendation = approvedRecommendations.find((recommendation) => recommendation.id === quoteRecommendationId) ?? null;

  return (
    <main className="space-y-4">
      <HeroHeader
        title={vehicle.registration_number}
        subtitle={`${vehicle.make ?? ''} ${vehicle.model ?? ''} ${vehicle.year ? `(${vehicle.year})` : ''}`}
        media={vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt="Vehicle" className="h-20 w-20 rounded-2xl object-cover" /> : <div className="h-20 w-20 rounded-2xl bg-white/10" />}
        meta={<><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">Mileage {vehicle.odometer_km ?? 'N/A'} km</span><span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">Status {vehicle.status ?? 'pending'}</span></>}
        actions={<><SendMessageModal vehicles={[{ id: vehicle.id, registration_number: vehicle.registration_number }]} defaultVehicleId={vehicle.id} customers={(customersResult.data ?? []).map((customer) => ({ id: customer.id, name: customer.name }))} defaultCustomerId={vehicle.current_customer_account_id} /><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/timeline`}>View full timeline</Link></Button><Button asChild size="sm" variant="secondary"><Link href={`/workshop/vehicles/${vehicle.id}/documents`}>View documents</Link></Button>{pendingVerification ? <VerifyVehicleButton vehicleId={vehicle.id} /> : null}</>}
      />


      {activeJob ? (
        <VehicleJobCardPanel
          vehicleId={vehicle.id}
          activeJob={activeJob}
          technicians={technicians}
          canClose={profile.role === 'admin'}
        />
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Revenue collected" value={money(paidTotal)} subtext="Paid invoices" icon={<BadgeDollarSign className="h-4 w-4" />} />
        <StatTile label="Outstanding balance" value={money(unpaidTotal)} subtext="Unpaid invoices" icon={<ReceiptText className="h-4 w-4" />} badge={unpaidInvoiceCount > 0 ? `${unpaidInvoiceCount} unpaid` : undefined} />
        <StatTile label="Open work requests" value={openRequests || 0} subtext="Active requests" icon={<ClipboardList className="h-4 w-4" />} />
        <StatTile label="Reports needing attention" value={attentionReports || 0} subtext="Urgent/high docs" icon={<FileWarning className="h-4 w-4" />} />
      </section>

      <SectionCard className="rounded-3xl border border-neutral-200/90 bg-neutral-50/70 p-7 shadow-[0_20px_42px_rgba(17,17,17,0.08)]">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Quick actions</h2>
          <p className="text-sm text-gray-500">Run common workshop updates without leaving this page.</p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
          <WorkshopVehicleActionsPanel prependTiles={!activeJob ? <VehicleJobCardPanel vehicleId={vehicle.id} activeJob={null} technicians={technicians} canClose={profile.role === 'admin'} /> : null} vehicleId={vehicle.id} invoices={(invoicesResult.data ?? []).map((invoice) => ({ id: invoice.id, invoiceNumber: invoice.invoice_number, paymentStatus: invoice.payment_status, totalCents: invoice.total_cents }))} jobs={(jobsResult.data ?? []).map((job) => ({ id: job.id }))} workRequests={(workRequestsResult.data ?? []).map((request) => ({ id: request.id, status: request.status }))} currentMileage={vehicle.odometer_km ?? 0} uploadDestinationLabel={uploadDestinationLabel} initialUploadMode={selectedApprovedRecommendation ? 'quote' : undefined} initialUploadSubject={selectedApprovedRecommendation?.title ?? undefined} />
        </div>
      </SectionCard>

      {approvedRecommendations.length ? (
        <SectionCard className="rounded-3xl border border-emerald-200/80 bg-emerald-50/50 p-7 shadow-[0_16px_36px_rgba(16,185,129,0.14)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold">Approved recommendations</h2>
            <p className="text-sm text-gray-600">Create quote documents directly from customer-approved recommendations.</p>
          </div>
          <div className="space-y-3">
            {approvedRecommendations.map((recommendation) => (
              <div key={recommendation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3">
                <div>
                  <p className="font-medium text-neutral-900">{recommendation.title}</p>
                  <p className="text-xs text-gray-500">Status approved</p>
                </div>
                <Button asChild size="sm">
                  <Link href={`/workshop/vehicles/${vehicle.id}?quoteRecommendationId=${recommendation.id}`}>Create quote</Link>
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </main>
  );
}
