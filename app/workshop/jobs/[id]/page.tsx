import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatJobCardStatus, jobProgressIndex } from '@/lib/job-cards';
import { JobCardDetailClient } from '@/components/workshop/job-card-detail-client';

export default async function WorkshopJobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,role,workshop_account_id').eq('id', auth.user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/customer/dashboard');

  const [{ data: job, error: jobError }, events, updates, photos, parts, blockers, approvals, checklist] = await Promise.all([
    supabase
      .from('job_cards')
      .select('id,vehicle_id,title,status,started_at,last_updated_at,completed_at,closed_at,is_locked,customer_summary,job_card_assignments(id,technician_user_id,profiles(display_name,full_name))')
      .eq('id', id)
      .eq('workshop_id', profile.workshop_account_id)
      .maybeSingle(),
    supabase.from('job_card_events').select('id,event_type,payload,created_at').eq('job_card_id', id).order('created_at', { ascending: false }),
    supabase.from('job_card_updates').select('id,message,created_at').eq('job_card_id', id).order('created_at', { ascending: false }),
    supabase.from('job_card_photos').select('id,kind,storage_path,uploaded_at').eq('job_card_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('job_card_parts').select('id,name,qty,status,eta,notes').eq('job_card_id', id).order('created_at', { ascending: false }),
    supabase.from('job_card_blockers').select('id,type,message,created_at,resolved_at').eq('job_card_id', id).order('created_at', { ascending: false }),
    supabase.from('job_card_approvals').select('id,title,description,estimate_amount,status,requested_at,decided_at').eq('job_card_id', id).order('requested_at', { ascending: false }),
    supabase.from('job_card_checklist_items').select('id,label,is_required,is_done,done_at').eq('job_card_id', id)
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

  if (!job) return <main><Card><h1 className="text-lg font-semibold">Job not found</h1></Card></main>;

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
    linkedQuoteId = (quoteLinkage as { quote_id: string | null } | null)?.quote_id ?? undefined;
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

  return (
    <main className="space-y-4">
      <Card className="rounded-3xl border border-black/10 bg-gradient-to-br from-black via-[#151515] to-[#262626] p-6 text-white shadow-[0_20px_48px_rgba(0,0,0,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/65">Job card</p>
            <h1 className="text-3xl font-semibold text-white">{job.title}</h1>
            <p className="text-sm text-white/70">
              Started {job.started_at ? new Date(job.started_at).toLocaleString() : 'Not started'} • Last updated{' '}
              {new Date(job.last_updated_at).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white">
              {formatJobCardStatus(job.status)}
            </span>
            <Button asChild size="sm" variant="secondary">
              <Link href={`/workshop/vehicles/${job.vehicle_id}`}>Back to vehicle</Link>
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {(job.job_card_assignments ?? []).map((assignment: { id: string; profiles: { display_name: string | null; full_name: string | null }[] | null }) => (
            <span key={assignment.id} className="rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs text-white/90">{assignment.profiles?.[0]?.display_name ?? assignment.profiles?.[0]?.full_name ?? 'Technician'}</span>
          ))}
        </div>
      </Card>
      <JobCardDetailClient
        jobId={job.id}
        vehicleId={job.vehicle_id}
        isLocked={job.is_locked}
        status={job.status}
        statusProgress={jobProgressIndex(job.status)}
        isManager={profile.role === 'admin'}
        events={events.data ?? []}
        updates={updates.data ?? []}
        photos={photos.data ?? []}
        parts={parts.data ?? []}
        blockers={blockers.data ?? []}
        approvals={approvals.data ?? []}
        checklist={checklist.data ?? []}
        linkedQuoteId={linkedQuoteId}
        linkedQuoteAmountCents={linkedQuoteAmountCents}
      />
    </main>
  );
}
