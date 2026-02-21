import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { formatJobCardStatus, jobProgressIndex } from '@/lib/job-cards';

export default async function CustomerJobCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) redirect('/login');

  const customerAccountId = context.customer_account.id;
  const [{ data: job }, updates, photos, approvals] = await Promise.all([
    supabase
      .from('job_cards')
      .select('id,vehicle_id,title,status,last_updated_at,customer_summary,vehicles(current_customer_account_id)')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('job_card_updates').select('id,message,created_at').eq('job_card_id', id).order('created_at', { ascending: false }),
    supabase.from('job_card_photos').select('id,kind,storage_path,uploaded_at').eq('job_card_id', id).order('uploaded_at', { ascending: false }),
    supabase.from('job_card_approvals').select('id,title,description,estimate_amount,status,requested_at').eq('job_card_id', id).order('requested_at', { ascending: false })
  ]);

  if (!job || (job.vehicles as Array<{ current_customer_account_id: string | null }> | null)?.[0]?.current_customer_account_id !== customerAccountId) {
    return <main><Card><h1 className="text-lg font-semibold">Job unavailable</h1></Card></main>;
  }

  return (
    <main className="space-y-4">
      <Card className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Job progress</p>
        <h1 className="text-2xl font-semibold text-black">{job.title}</h1>
        <p className="text-sm text-gray-500">{formatJobCardStatus(job.status)} • Updated {new Date(job.last_updated_at).toLocaleString()}</p>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {['Not started', 'In progress', 'Waiting', 'Quality check', 'Completed'].map((step, index) => (
            <div key={step} className={`rounded-lg px-2 py-1 text-center text-[11px] ${index <= jobProgressIndex(job.status) ? 'bg-black text-white' : 'bg-neutral-100 text-gray-500'}`}>{step}</div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Customer updates</h2>
        <div className="mt-3 space-y-2 text-sm">{(updates.data ?? []).length ? (updates.data ?? []).map((update) => <p key={update.id}>{update.message}</p>) : <p className="text-gray-500">No updates yet.</p>}</div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Before and after photos</h2>
        <div className="mt-3 space-y-1 text-sm">{(photos.data ?? []).length ? (photos.data ?? []).map((photo) => <p key={photo.id}>{photo.kind}: {photo.storage_path}</p>) : <p className="text-gray-500">No photos yet.</p>}</div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Approvals</h2>
        <div className="mt-3 space-y-1 text-sm">{(approvals.data ?? []).length ? (approvals.data ?? []).map((approval) => <p key={approval.id}>{approval.title} — {approval.status}</p>) : <p className="text-gray-500">No approvals requested.</p>}</div>
      </Card>
      {job.customer_summary ? <Card><h2 className="text-lg font-semibold">Final summary</h2><p className="mt-2 text-sm text-gray-700">{job.customer_summary}</p></Card> : null}
    </main>
  );
}
