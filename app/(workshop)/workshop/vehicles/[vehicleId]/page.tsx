import type { ReactNode } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  BadgeDollarSign,
  ClipboardList,
  ExternalLink,
  FileWarning,
  Hammer,
  ReceiptText
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ActionTile } from '@/components/workshop/action-tile';
import { createClient } from '@/lib/supabase/server';
import { HeroHeader } from '@/components/layout/hero-header';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';
import { WorkshopVehicleActionsPanel } from '@/components/workshop/workshop-vehicle-actions-panel';
import { VehicleJobCardPanel } from '@/components/workshop/vehicle-job-card-panel';
import { SectionCard } from '@/components/ui/section-card';
import { SendMessageModal } from '@/components/messages/send-message-modal';
import { formatJobCardStatus } from '@/lib/job-cards';

function money(cents: number) {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR'
  }).format((cents ?? 0) / 100);
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
      {badge ? (
        <span className="absolute right-4 top-4 rounded-full bg-red-50 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-red-700">
          {badge}
        </span>
      ) : null}
      <span className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
        {icon}
      </span>
      <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-gray-500">
        {label}
      </p>
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
  searchParams: Promise<{
    quoteRecommendationId?: string;
    upload?: string;
    closeJobId?: string;
  }>;
}) {
  const { vehicleId } = await params;
  const { quoteRecommendationId, upload, closeJobId } = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();
  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  )
    redirect('/customer/dashboard');

  const workshopId = profile.workshop_account_id;
  const [
    vehicleResult,
    jobsResult,
    invoicesResult,
    docsResult,
    workRequestsResult,
    customersResult,
    recommendationsResult,
    quotesResult,
    activeJobResult,
    latestOpenJobResult,
    techniciansResult
  ] = await Promise.all([
    supabase
      .from('vehicles')
      .select(
        'id,registration_number,make,model,year,odometer_km,workshop_account_id,primary_image_path,status,current_customer_account_id'
      )
      .eq('id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .maybeSingle(),
    supabase
      .from('job_cards')
      .select('id,status')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_id', workshopId)
      .in('status', [
        'not_started',
        'in_progress',
        'waiting_parts',
        'waiting_approval',
        'quality_check',
        'ready'
      ]),
    supabase
      .from('invoices')
      .select('id,payment_status,total_cents,invoice_number')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId),
    supabase
      .from('vehicle_documents')
      .select('id,importance')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId),
    supabase
      .from('work_requests')
      .select('id,status')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId),
    supabase
      .from('customer_accounts')
      .select('id,name')
      .eq('workshop_account_id', workshopId)
      .order('name', { ascending: true }),
    supabase
      .from('recommendations')
      .select('id,title,status,description,created_at')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .order('created_at', { ascending: false }),
    supabase
      .from('quotes')
      .select(
        'id,quote_number,total_cents,status,created_at,invoices:invoices!left(id,status)'
      )
      .eq('vehicle_id', vehicleId)
      .eq('workshop_account_id', workshopId)
      .eq('status', 'approved')
      .order('created_at', { ascending: false }),

    supabase
      .from('job_cards')
      .select(
        'id,title,status,started_at,last_updated_at,quote_id'
      )
      .eq('vehicle_id', vehicleId)
      .eq('workshop_id', workshopId)
      .in('status', [
        'not_started',
        'in_progress',
        'waiting_parts',
        'waiting_approval',
        'quality_check',
        'ready'
      ])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('job_cards')
      .select('id,title,status,started_at,last_updated_at')
      .eq('vehicle_id', vehicleId)
      .eq('workshop_id', workshopId)
      .neq('status', 'closed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('workshop_users')
      .select('profile_id,profiles(display_name,full_name)')
      .eq('workshop_account_id', workshopId)
  ]);

  if (activeJobResult.error) {
    console.error('Failed to load active job card', {
      vehicleId,
      workshopId,
      error: activeJobResult.error.message
    });
  }

  if (latestOpenJobResult.error) {
    console.error('Failed to load latest non-closed job card for vehicle', {
      vehicleId,
      workshopId,
      error: latestOpenJobResult.error.message
    });
  }
  const activeJobRaw = activeJobResult.data;
  const activeJobAssignmentsResult = activeJobRaw
    ? await supabase
        .from('job_card_assignments')
        .select(
          'id,technician_user_id,profiles!left(display_name,full_name,avatar_url)'
        )
        .eq('job_card_id', activeJobRaw.id)
    : { data: [], error: null };

  if (activeJobAssignmentsResult.error) {
    console.error('Failed to load active job assignments', {
      vehicleId,
      workshopId,
      jobId: activeJobRaw?.id,
      error: activeJobAssignmentsResult.error.message
    });
  }

  const vehicle = vehicleResult.data;
  if (!vehicle)
    return (
      <main>
        <Card>
          <h1 className="text-xl font-semibold">Vehicle not found</h1>
        </Card>
      </main>
    );

  const { data: customerAccount } = vehicle.current_customer_account_id
    ? await supabase
        .from('customer_accounts')
        .select('name')
        .eq('id', vehicle.current_customer_account_id)
        .maybeSingle()
    : { data: null };

  const customerName = customerAccount?.name?.trim() || 'Customer';
  const vehicleLabel =
    `${vehicle.make?.trim() || 'Vehicle'} ${vehicle.model?.trim() || ''}`.trim();
  const uploadDestinationLabel = `${customerName} • ${vehicleLabel} timeline`;
  const invoices = invoicesResult.data ?? [];
  const paidTotal = invoices
    .filter((x) => x.payment_status === 'paid')
    .reduce((sum, x) => sum + (x.total_cents ?? 0), 0);
  const unpaidTotal = invoices
    .filter((x) => x.payment_status !== 'paid')
    .reduce((sum, x) => sum + (x.total_cents ?? 0), 0);
  const openRequests = (workRequestsResult.data ?? []).filter(
    (x) => !['completed', 'delivered', 'cancelled'].includes(x.status)
  ).length;
  const attentionReports = (docsResult.data ?? []).filter(
    (x) =>
      (x.importance ?? '').toLowerCase() === 'high' ||
      (x.importance ?? '').toLowerCase() === 'urgent'
  ).length;
  const pendingVerification = (vehicle.status ?? '')
    .toLowerCase()
    .includes('pending');
  const activeJob = activeJobRaw
    ? {
        id: activeJobRaw.id,
        title: activeJobRaw.title,
        status: activeJobRaw.status,
        started_at: activeJobRaw.started_at,
        last_updated_at: activeJobRaw.last_updated_at,
        quoteId: activeJobRaw.quote_id,
        assignments: (activeJobAssignmentsResult.data ?? []).map(
          (assignment: {
            id: string;
            profiles:
              | {
                  display_name: string | null;
                  full_name: string | null;
                  avatar_url: string | null;
                }[]
              | null;
          }) => ({
            id: assignment.id,
            name:
              assignment.profiles?.[0]?.display_name ??
              assignment.profiles?.[0]?.full_name ??
              'Technician',
            avatarUrl: assignment.profiles?.[0]?.avatar_url ?? null
          })
        )
      }
    : null;
  const latestOpenJob = !activeJob && latestOpenJobResult.data
    ? {
        id: latestOpenJobResult.data.id,
        title: latestOpenJobResult.data.title,
        status: latestOpenJobResult.data.status,
        started_at: latestOpenJobResult.data.started_at,
        last_updated_at: latestOpenJobResult.data.last_updated_at
      }
    : null;
  const technicians = (techniciansResult.data ?? []).map(
    (row: {
      profile_id: string;
      profiles:
        | { display_name: string | null; full_name: string | null }[]
        | null;
    }) => ({
      id: row.profile_id,
      name:
        row.profiles?.[0]?.display_name ??
        row.profiles?.[0]?.full_name ??
        'Technician'
    })
  );
  const unpaidInvoiceCount = invoices.filter(
    (x) => x.payment_status !== 'paid'
  ).length;
  const recommendations = recommendationsResult.data ?? [];
  const approvedRecommendations = recommendations.filter(
    (recommendation) =>
      (recommendation.status ?? '').toLowerCase() === 'approved'
  );
  const selectedApprovedRecommendation =
    approvedRecommendations.find(
      (recommendation) => recommendation.id === quoteRecommendationId
    ) ?? null;

  const initialUploadMode =
    upload === 'invoice'
      ? 'invoice'
      : selectedApprovedRecommendation
        ? 'quote'
        : undefined;
  const pendingCloseJobId =
    upload === 'invoice' && closeJobId ? closeJobId : undefined;
  const approvedQuotes = (quotesResult.data ?? [])
    .filter(
      (quote: { invoices: Array<{ status: string | null }> | null }) =>
        !(quote.invoices ?? []).some(
          (invoice) => (invoice.status ?? '').toLowerCase() !== 'draft'
        )
    )
    .map(
      (quote: {
        id: string;
        quote_number: string | null;
        total_cents: number | null;
        created_at: string;
      }) => ({
        id: quote.id,
        quoteNumber: quote.quote_number,
        totalCents: quote.total_cents ?? 0,
        createdAt: quote.created_at
      })
    );
  const pendingCloseQuote =
    pendingCloseJobId && activeJob?.id === pendingCloseJobId
      ? approvedQuotes.find((quote) => quote.id === activeJob.quoteId)
      : undefined;

  return (
    <main className="space-y-4">
      <HeroHeader
        title={vehicle.registration_number}
        subtitle={`${vehicle.make ?? ''} ${vehicle.model ?? ''} ${vehicle.year ? `(${vehicle.year})` : ''}`}
        media={
          vehicle.primary_image_path ? (
            <img
              src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`}
              alt="Vehicle"
              className="h-20 w-20 rounded-2xl object-cover"
            />
          ) : (
            <div className="h-20 w-20 rounded-2xl bg-white/10" />
          )
        }
        meta={
          <>
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">
              Mileage {vehicle.odometer_km ?? 'N/A'} km
            </span>
            <span className="rounded-full border border-white/25 bg-white/10 px-3 py-1">
              Status {vehicle.status ?? 'pending'}
            </span>
          </>
        }
        actions={
          <>
            <SendMessageModal
              vehicles={[
                {
                  id: vehicle.id,
                  registration_number: vehicle.registration_number
                }
              ]}
              defaultVehicleId={vehicle.id}
              customers={(customersResult.data ?? []).map((customer) => ({
                id: customer.id,
                name: customer.name
              }))}
              defaultCustomerId={vehicle.current_customer_account_id}
            />
            <Button asChild size="sm" variant="secondary">
              <Link href={`/workshop/vehicles/${vehicle.id}/timeline`}>
                View full timeline
              </Link>
            </Button>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/workshop/vehicles/${vehicle.id}/documents`}>
                View documents
              </Link>
            </Button>
            {activeJob ? (
              <Button asChild size="sm" variant="secondary">
                <Link href={`/workshop/jobs/${activeJob.id}`}>Open active job card</Link>
              </Button>
            ) : null}
            {pendingVerification ? (
              <VerifyVehicleButton vehicleId={vehicle.id} />
            ) : null}
          </>
        }
      />

      {activeJob ? (
        <VehicleJobCardPanel
          vehicleId={vehicle.id}
          activeJob={activeJob}
          technicians={technicians}
          approvedQuotes={approvedQuotes}
          canClose={profile.role === 'admin'}
        />
      ) : null}

      {latestOpenJob ? (
        <Card className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-[0_12px_24px_rgba(245,158,11,0.12)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-700">
                Job card overview
              </p>
              <h2 className="mt-1 text-lg font-semibold text-neutral-900">
                {latestOpenJob.title}
              </h2>
              <p className="mt-1 text-sm text-neutral-600">
                Status {formatJobCardStatus(latestOpenJob.status)}
              </p>
              <p className="text-xs text-neutral-500">
                Started{' '}
                {latestOpenJob.started_at
                  ? new Date(latestOpenJob.started_at).toLocaleString()
                  : 'Not started'}{' '}
                • Updated {new Date(latestOpenJob.last_updated_at).toLocaleString()}
              </p>
            </div>
            <Button asChild>
              <Link href={`/workshop/jobs/${latestOpenJob.id}`}>
                Open job card <ExternalLink className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Revenue collected"
          value={money(paidTotal)}
          subtext="Paid invoices"
          icon={<BadgeDollarSign className="h-4 w-4" />}
        />
        <StatTile
          label="Outstanding balance"
          value={money(unpaidTotal)}
          subtext="Unpaid invoices"
          icon={<ReceiptText className="h-4 w-4" />}
          badge={
            unpaidInvoiceCount > 0 ? `${unpaidInvoiceCount} unpaid` : undefined
          }
        />
        <StatTile
          label="Open work requests"
          value={openRequests || 0}
          subtext="Active requests"
          icon={<ClipboardList className="h-4 w-4" />}
        />
        <StatTile
          label="Reports needing attention"
          value={attentionReports || 0}
          subtext="Urgent/high docs"
          icon={<FileWarning className="h-4 w-4" />}
        />
      </section>

      <SectionCard className="rounded-3xl border border-neutral-200/90 bg-neutral-50/70 p-7 shadow-[0_20px_42px_rgba(17,17,17,0.08)]">
        <div className="mb-4">
          <h2 className="text-base font-semibold">Quick actions</h2>
          <p className="text-sm text-gray-500">
            Run common workshop updates without leaving this page.
          </p>
        </div>
        <div className="rounded-2xl border border-neutral-200 bg-white/80 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.5)]">
          <WorkshopVehicleActionsPanel
            prependTiles={
              !activeJob ? (
                <VehicleJobCardPanel
                  vehicleId={vehicle.id}
                  activeJob={null}
                  technicians={technicians}
                  approvedQuotes={approvedQuotes}
                  canClose={profile.role === 'admin'}
                />
              ) : (
                <ActionTile
                  title={`Job ${formatJobCardStatus(activeJob.status)}`}
                  description="This vehicle has an active job card. Open it to update progress and close the work."
                  icon={<Hammer className="h-4 w-4" />}
                  primary
                  onClick={() => {
                    window.location.href = `/workshop/jobs/${activeJob.id}`;
                  }}
                />
              )
            }
            vehicleId={vehicle.id}
            invoices={(invoicesResult.data ?? []).map((invoice) => ({
              id: invoice.id,
              invoiceNumber: invoice.invoice_number,
              paymentStatus: invoice.payment_status,
              totalCents: invoice.total_cents
            }))}
            jobs={(jobsResult.data ?? []).map((job) => ({ id: job.id }))}
            workRequests={(workRequestsResult.data ?? []).map((request) => ({
              id: request.id,
              status: request.status
            }))}
            currentMileage={vehicle.odometer_km ?? 0}
            uploadDestinationLabel={uploadDestinationLabel}
            initialUploadMode={initialUploadMode}
            initialUploadSubject={
              selectedApprovedRecommendation?.title ?? undefined
            }
            pendingCloseJobId={pendingCloseJobId}
            pendingInvoiceQuoteId={pendingCloseQuote?.id}
            pendingInvoiceAmountCents={pendingCloseQuote?.totalCents}
          />
        </div>
      </SectionCard>

      {approvedRecommendations.length ? (
        <SectionCard className="rounded-3xl border border-emerald-200/80 bg-emerald-50/50 p-7 shadow-[0_16px_36px_rgba(16,185,129,0.14)]">
          <div className="mb-4">
            <h2 className="text-base font-semibold">
              Approved recommendations
            </h2>
            <p className="text-sm text-gray-600">
              Create quote documents directly from customer-approved
              recommendations.
            </p>
          </div>
          <div className="space-y-3">
            {approvedRecommendations.map((recommendation) => (
              <div
                key={recommendation.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3"
              >
                <div>
                  <p className="font-medium text-neutral-900">
                    {recommendation.title}
                  </p>
                  <p className="text-xs text-gray-500">Status approved</p>
                </div>
                <Button asChild size="sm">
                  <Link
                    href={`/workshop/vehicles/${vehicle.id}?quoteRecommendationId=${recommendation.id}`}
                  >
                    Create quote
                  </Link>
                </Button>
              </div>
            ))}
          </div>
        </SectionCard>
      ) : null}
    </main>
  );
}
