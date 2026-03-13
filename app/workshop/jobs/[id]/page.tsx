import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatJobCardStatus, jobProgressIndex } from '@/lib/job-cards';
import { JobCardDetailClient } from '@/components/workshop/job-card-detail-client';

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}

function getSafeErrorMessage(message?: string) {
  if (!message) return 'Please try again in a moment.';
  const singleLine = message.replace(/\s+/g, ' ').trim();
  if (!singleLine) return 'Please try again in a moment.';
  return singleLine;
}

export default async function WorkshopJobCardPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id,role,workshop_account_id')
    .eq('id', auth.user.id)
    .maybeSingle();
  if (!profile?.workshop_account_id) redirect('/customer/dashboard');

  const [
    { data: job, error: jobError },
    events,
    updates,
    photos,
    parts,
    blockers,
    approvals,
    checklist,
    techniciansResult
  ] = await Promise.all([
    supabase
      .from('job_cards')
      .select(
        'id,vehicle_id,title,status,started_at,last_updated_at,completed_at,closed_at,is_locked,customer_summary,job_card_assignments(id,technician_user_id,status,force_assigned,technician_profile:profiles!job_card_assignments_technician_user_id_fkey(display_name,full_name)),vehicles!job_cards_vehicle_id_fkey(current_customer_account_id)'
      )
      .eq('id', id)
      .eq('workshop_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase
      .from('job_card_events')
      .select('id,event_type,payload,created_at')
      .eq('job_card_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('job_card_updates')
      .select('id,message,created_at')
      .eq('job_card_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('job_card_photos')
      .select('id,kind,storage_path,title,uploaded_at')
      .eq('job_card_id', id)
      .order('uploaded_at', { ascending: false }),
    supabase
      .from('job_card_parts')
      .select('id,name,qty,status,eta,notes')
      .eq('job_card_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('job_card_blockers')
      .select('id,type,message,created_at,resolved_at')
      .eq('job_card_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('job_card_approvals')
      .select(
        'id,title,description,estimate_amount,status,requested_at,decided_at'
      )
      .eq('job_card_id', id)
      .order('requested_at', { ascending: false }),
    supabase
      .from('job_card_checklist_items')
      .select('id,label,is_required,is_done,done_at')
      .eq('job_card_id', id),
    supabase
      .from('profiles')
      .select('id,display_name,full_name')
      .eq('workshop_account_id', profile.workshop_account_id)
      .eq('role', 'technician')
      .order('display_name', { ascending: true })
  ]);

  console.error('[WorkshopJobCardPage] primary_query', {
    jobCardId: id,
    hasJob: Boolean(job),
    jobError,
    eventsError: events.error,
    eventsCount: events.data?.length ?? null,
    updatesError: updates.error,
    updatesCount: updates.data?.length ?? null,
    photosError: photos.error,
    photosCount: photos.data?.length ?? null,
    partsError: parts.error,
    partsCount: parts.data?.length ?? null,
    blockersError: blockers.error,
    blockersCount: blockers.data?.length ?? null,
    approvalsError: approvals.error,
    approvalsCount: approvals.data?.length ?? null,
    checklistError: checklist.error,
    checklistCount: checklist.data?.length ?? null
  });

  if (jobError)
    return (
      <main>
        <Card>
          <h1 className="text-lg font-semibold">Unable to load job card</h1>
          <p className="mt-2 text-sm text-gray-600">
            {getSafeErrorMessage(jobError.message)}
          </p>
        </Card>
      </main>
    );

  if (!job)
    return (
      <main>
        <Card>
          <h1 className="text-lg font-semibold">Job not found</h1>
        </Card>
      </main>
    );

  if (job.status === 'closed') redirect(`/workshop/vehicles/${job.vehicle_id}`);

  let linkedQuoteId: string | undefined;
  let linkedQuoteAmountCents: number | undefined;

  const { data: quoteLinkage, error: quoteLinkageError } = await supabase
    .from('job_cards')
    .select('quote_id')
    .eq('id', id)
    .eq('workshop_id', profile.workshop_account_id)
    .maybeSingle();

  console.error('[WorkshopJobCardPage] quote_linkage_query', {
    jobCardId: id,
    quoteLinkage,
    quoteLinkageError
  });

  if (!quoteLinkageError) {
    linkedQuoteId =
      (quoteLinkage as { quote_id: string | null } | null)?.quote_id ??
      undefined;
  }

  if (linkedQuoteId) {
    const { data: linkedQuote, error: linkedQuoteError } = await supabase
      .from('quotes')
      .select('id,total_cents')
      .eq('id', linkedQuoteId)
      .eq('vehicle_id', job.vehicle_id)
      .maybeSingle();

    console.error('[WorkshopJobCardPage] linked_quote_query', {
      jobCardId: id,
      linkedQuoteId,
      linkedQuote,
      linkedQuoteError
    });

    linkedQuoteAmountCents = linkedQuote?.total_cents ?? undefined;
  }

  const assignmentChips = (job.job_card_assignments ?? []).map(
    (assignment: {
      id: string;
      status: string;
      technician_user_id: string;
      technician_profile:
        | { display_name: string | null; full_name: string | null }[]
        | null;
    }) => ({
      id: assignment.id,
      technicianUserId: assignment.technician_user_id,
      status: assignment.status ?? 'accepted',
      name:
        assignment.technician_profile?.[0]?.display_name ??
        assignment.technician_profile?.[0]?.full_name ??
        'Technician'
    })
  );

  const technicians = (techniciansResult.data ?? []).map((technician) => ({
    id: technician.id,
    name: technician.display_name ?? technician.full_name ?? 'Technician'
  }));

  const vehicleCustomerAccountId = Array.isArray(job.vehicles)
    ? job.vehicles[0]?.current_customer_account_id ?? null
    : (job.vehicles as { current_customer_account_id?: string | null } | null)
        ?.current_customer_account_id ?? null;

  return (
    <main className="space-y-5">
      <Card className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-[0_14px_30px_rgba(17,17,17,0.07)] md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">
              Job card
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold text-neutral-900 md:text-[1.75rem]">
                {job.title}
              </h1>
              <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700">
                {formatJobCardStatus(job.status)}
              </span>
            </div>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link href={`/workshop/vehicles/${job.vehicle_id}`}>
              Back to vehicle
            </Link>
          </Button>
        </div>

        <div className="mt-4 grid gap-3 text-sm text-gray-600 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              Started
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-800">
              {formatDateTime(job.started_at)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 px-3 py-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              Last updated
            </p>
            <p className="mt-1 text-sm font-medium text-neutral-800">
              {formatDateTime(job.last_updated_at)}
            </p>
          </div>
          <div className="rounded-2xl border border-neutral-200 bg-neutral-50/80 px-3 py-2 sm:col-span-2 lg:col-span-2">
            <p className="text-[11px] uppercase tracking-wide text-gray-500">
              Assigned technicians
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {assignmentChips.length ? (
                assignmentChips.map((assignment) => (
                  <span
                    key={assignment.id}
                    className="rounded-full border border-neutral-200 bg-white px-2.5 py-1 text-xs font-medium text-neutral-700"
                  >
                    {assignment.name}
                  </span>
                ))
              ) : (
                <span className="text-sm text-gray-500">
                  No technician assigned
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>
      <JobCardDetailClient
        jobId={job.id}
        vehicleId={job.vehicle_id}
        customerAccountId={vehicleCustomerAccountId}
        isLocked={job.is_locked}
        status={job.status}
        statusProgress={jobProgressIndex(job.status)}
        isManager={profile.role === 'admin'}
        viewerRole={profile.role}
        currentProfileId={profile.id}
        events={events.data ?? []}
        updates={updates.data ?? []}
        photos={photos.data ?? []}
        parts={parts.data ?? []}
        blockers={blockers.data ?? []}
        approvals={approvals.data ?? []}
        checklist={checklist.data ?? []}
        linkedQuoteId={linkedQuoteId}
        linkedQuoteAmountCents={linkedQuoteAmountCents}
        technicians={technicians}
        assignments={assignmentChips}
      />
    </main>
  );
}
