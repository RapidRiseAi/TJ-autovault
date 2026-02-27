import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';
import { formatJobCardStatus, jobProgressIndex } from '@/lib/job-cards';
import { JobApprovalActions } from '@/components/customer/job-approval-actions';

function resolveVehicleCustomerAccountId(value: unknown): string | null {
  if (!value) return null;
  if (Array.isArray(value)) {
    const accountId = (
      value[0] as { current_customer_account_id?: unknown } | undefined
    )?.current_customer_account_id;
    return typeof accountId === 'string' ? accountId : null;
  }
  const accountId = (value as { current_customer_account_id?: unknown })
    .current_customer_account_id;
  return typeof accountId === 'string' ? accountId : null;
}

export default async function CustomerJobCardPage({
  params
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) redirect('/login');

  const customerAccountId = context.customer_account.id;
  const { data: job } = await supabase
    .from('job_cards')
    .select(
      'id,vehicle_id,title,status,last_updated_at,customer_summary,quote_id,vehicles(current_customer_account_id)'
    )
    .eq('id', id)
    .maybeSingle();

  if (!job || resolveVehicleCustomerAccountId(job.vehicles) !== customerAccountId) {
    return (
      <main>
        <Card>
          <h1 className="text-lg font-semibold">Job unavailable</h1>
        </Card>
      </main>
    );
  }

  const [updates, photos, approvals, events, quote, invoice, documents] =
    await Promise.all([
      supabase
        .from('job_card_updates')
        .select('id,message,created_at')
        .eq('job_card_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('job_card_photos')
        .select('id,kind,storage_path,uploaded_at')
        .eq('job_card_id', id)
        .order('uploaded_at', { ascending: false }),
      supabase
        .from('job_card_approvals')
        .select('id,title,description,estimate_amount,status,requested_at')
        .eq('job_card_id', id)
        .order('requested_at', { ascending: false }),
      supabase
        .from('job_card_events')
        .select('id,event_type,payload,created_at')
        .eq('job_card_id', id)
        .order('created_at', { ascending: false }),
      job.quote_id
        ? supabase
            .from('quotes')
            .select('id,status,total_cents,notes,quote_number')
            .eq('id', job.quote_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      job.quote_id
        ? supabase
            .from('invoices')
            .select('id,status,payment_status,total_cents,notes,invoice_number,quote_id')
            .eq('quote_id', job.quote_id)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      supabase
        .from('vehicle_documents')
        .select(
          'id,subject,original_name,document_type,storage_bucket,storage_path,created_at,quote_id,invoice_id'
        )
        .eq('vehicle_id', job.vehicle_id)
        .eq('customer_account_id', customerAccountId)
        .order('created_at', { ascending: false })
        .limit(100)
    ]);

  const jobDocuments = (documents.data ?? []).filter(
    (doc) => doc.quote_id === job.quote_id || doc.invoice_id === invoice.data?.id
  );

  return (
    <main className="space-y-4">
      <Card className="rounded-2xl border border-neutral-200 bg-white p-5">
        <p className="text-xs uppercase tracking-[0.14em] text-gray-500">
          Job progress
        </p>
        <h1 className="text-2xl font-semibold text-black">{job.title}</h1>
        <p className="text-sm text-gray-500">
          {formatJobCardStatus(job.status)} • Updated{' '}
          {new Date(job.last_updated_at).toLocaleString()}
        </p>
        <div className="mt-3 grid grid-cols-5 gap-2">
          {[
            'Not started',
            'In progress',
            'Waiting',
            'Quality check',
            'Completed'
          ].map((step, index) => (
            <div
              key={step}
              className={`rounded-lg px-2 py-1 text-center text-[11px] ${index <= jobProgressIndex(job.status) ? 'bg-black text-white' : 'bg-neutral-100 text-gray-500'}`}
            >
              {step}
            </div>
          ))}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Customer updates</h2>
        <div className="mt-3 space-y-2 text-sm">
          {(updates.data ?? []).length ? (
            (updates.data ?? []).map((update) => (
              <p key={update.id}>{update.message}</p>
            ))
          ) : (
            <p className="text-gray-500">No updates yet.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Before and after photos</h2>
        <div className="mt-3 space-y-1 text-sm">
          {(photos.data ?? []).length ? (
            (photos.data ?? []).map((photo) => (
              <p key={photo.id}>
                {photo.kind}: {photo.storage_path}
              </p>
            ))
          ) : (
            <p className="text-gray-500">No photos yet.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Approvals</h2>
        <div className="mt-3 space-y-3 text-sm">
          {(approvals.data ?? []).length ? (
            (approvals.data ?? []).map((approval) => (
              <div key={approval.id} className="rounded-lg border border-black/10 p-3">
                <p className="font-medium">
                  {approval.title} — {approval.status}
                </p>
                <p className="text-gray-500">
                  {approval.description ?? 'No details provided.'}
                </p>
                <JobApprovalActions
                  approvalId={approval.id}
                  status={approval.status}
                />
              </div>
            ))
          ) : (
            <p className="text-gray-500">No approvals requested.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Job notes & status events</h2>
        <div className="mt-3 space-y-2 text-sm">
          {(events.data ?? []).length ? (
            (events.data ?? []).map((event) => (
              <div key={event.id} className="rounded border border-black/10 p-2">
                <p className="font-medium">
                  {event.event_type.replaceAll('_', ' ')}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(event.created_at).toLocaleString()}
                </p>
              </div>
            ))
          ) : (
            <p className="text-gray-500">No events yet.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Quote & invoice</h2>
        <div className="mt-3 space-y-2 text-sm">
          {quote.data ? (
            <p>
              Quote #{quote.data.quote_number ?? quote.data.id.slice(0, 8)} —{' '}
              {quote.data.status} — {(quote.data.total_cents ?? 0) / 100}
            </p>
          ) : (
            <p className="text-gray-500">No quote linked.</p>
          )}
          {invoice.data ? (
            <p>
              Invoice #{invoice.data.invoice_number ?? invoice.data.id.slice(0, 8)}
              {' — '}
              {invoice.data.status} / {invoice.data.payment_status} —{' '}
              {(invoice.data.total_cents ?? 0) / 100}
            </p>
          ) : (
            <p className="text-gray-500">No invoice linked.</p>
          )}
        </div>
      </Card>
      <Card>
        <h2 className="text-lg font-semibold">Files linked to this job</h2>
        <div className="mt-3 space-y-2 text-sm">
          {jobDocuments.length ? (
            jobDocuments.map((file) => (
              <p key={file.id}>
                {file.subject ?? file.original_name ?? 'File'} ({file.document_type})
              </p>
            ))
          ) : (
            <p className="text-gray-500">No files linked.</p>
          )}
        </div>
      </Card>
      {job.customer_summary ? (
        <Card>
          <h2 className="text-lg font-semibold">Final summary</h2>
          <p className="mt-2 text-sm text-gray-700">{job.customer_summary}</p>
        </Card>
      ) : null}
    </main>
  );
}
