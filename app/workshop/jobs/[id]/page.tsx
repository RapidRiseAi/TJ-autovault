import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Card } from '@/components/ui/card';
import { formatJobCardStatus, jobProgressIndex } from '@/lib/job-cards';
import { JobCardDetailClient } from '@/components/workshop/job-card-detail-client';

export default async function WorkshopJobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('id,role,workshop_account_id').eq('id', auth.user.id).maybeSingle();
  if (!profile?.workshop_account_id) redirect('/customer/dashboard');

  const [{ data: job }, events, updates, photos, parts, blockers, approvals, checklist] = await Promise.all([
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

  if (!job) return <main><Card><h1 className="text-lg font-semibold">Job not found</h1></Card></main>;

  return (
    <main className="space-y-4">
      <Card className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Job card</p>
        <h1 className="text-2xl font-semibold text-black">{job.title}</h1>
        <p className="text-sm text-gray-500">Status: {formatJobCardStatus(job.status)} • Started {job.started_at ? new Date(job.started_at).toLocaleString() : 'Not started'} • Last updated {new Date(job.last_updated_at).toLocaleString()}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(job.job_card_assignments ?? []).map((assignment: { id: string; profiles: { display_name: string | null; full_name: string | null }[] | null }) => (
            <span key={assignment.id} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs">{assignment.profiles?.[0]?.display_name ?? assignment.profiles?.[0]?.full_name ?? 'Technician'}</span>
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
      />
    </main>
  );
}
