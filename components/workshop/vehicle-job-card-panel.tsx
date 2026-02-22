'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, PlayCircle } from 'lucide-react';
import { ActionTile } from '@/components/workshop/action-tile';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';
import { addJobCardEvent, closeJobCard, startJobCard, updateJobCardStatus } from '@/lib/actions/job-cards';
import { formatJobCardStatus, JOB_CARD_STATUSES } from '@/lib/job-cards';

export function VehicleJobCardPanel({
  vehicleId,
  activeJob,
  technicians,
  approvedQuotes,
  canClose
}: {
  vehicleId: string;
  activeJob: null | {
    id: string;
    title: string;
    status: string;
    started_at: string | null;
    last_updated_at: string;
    assignments: Array<{ id: string; name: string; avatarUrl: string | null }>;
  };
  technicians: Array<{ id: string; name: string }>;
  approvedQuotes: Array<{ id: string; quoteNumber: string | null; totalCents: number; createdAt: string }>;
  canClose: boolean;
}) {
  const [startOpen, setStartOpen] = useState(false);
  const [invoicePromptOpen, setInvoicePromptOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const { pushToast } = useToast();

  async function run<T>(
    fn: () => Promise<T & { ok: boolean; error?: string }>,
    onDone?: () => void,
    options?: { reloadOnSuccess?: boolean }
  ) {
    setIsSaving(true);
    const result = await fn();
    setIsSaving(false);
    if (result.ok) {
      pushToast({ title: 'Saved', tone: 'success' });
      onDone?.();
      if (options?.reloadOnSuccess ?? true) {
        window.location.reload();
      }
      return;
    }
    pushToast({ title: 'Could not save', description: result.error, tone: 'error' });
  }

  async function uploadBeforePhotos(files: File[]) {
    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const paths: string[] = [];
    for (const file of imageFiles) {
      const signResponse = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type, kind: 'image', documentType: 'before_photos' })
      });
      if (!signResponse.ok) throw new Error('Could not sign upload');
      const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string };
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });
      if (!uploadResponse.ok) throw new Error('Could not upload file');
      paths.push(signedPayload.path);
    }
    return paths;
  }

  if (!activeJob) {
    return (
      <>
        <ActionTile
          title="Start job"
          description="Create a new job card from an approved quote and upload before photos."
          icon={<PlayCircle className="h-4 w-4" />}
          primary
          onClick={() => setStartOpen(true)}
        />
        <Modal open={startOpen} onClose={() => setStartOpen(false)} title="Start job card">
          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const quoteId = String(formData.get('quoteId') || '');
              const selectedQuote = approvedQuotes.find((quote) => quote.id === quoteId);
              const photoFiles = formData.getAll('beforePhotos').filter((value): value is File => value instanceof File);
              const technicianIds = formData.getAll('technicianIds').map(String);

              void run(async () => {
                if (!selectedQuote) return { ok: false, error: 'Please choose an approved quote.' };
                const beforePhotoPaths = await uploadBeforePhotos(photoFiles);
                const quoteLabel = selectedQuote.quoteNumber?.trim() || selectedQuote.id.slice(0, 8).toUpperCase();
                return startJobCard({
                  vehicleId,
                  quoteId: selectedQuote.id,
                  title: `Quote ${quoteLabel}`,
                  beforePhotoPaths,
                  technicianIds
                });
              }, () => setStartOpen(false));
            }}
          >
            <select name="quoteId" required className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" defaultValue={approvedQuotes[0]?.id ?? ''}>
              {approvedQuotes.length ? approvedQuotes.map((quote) => (
                <option key={quote.id} value={quote.id}>
                  {(quote.quoteNumber ?? `#${quote.id.slice(0, 8).toUpperCase()}`)} • R {(quote.totalCents / 100).toFixed(2)}
                </option>
              )) : <option value="">No approved quotes without sent invoices</option>}
            </select>
            <input name="beforePhotos" type="file" accept="image/*" multiple required className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" />
            <select name="technicianIds" multiple className="w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm" defaultValue={[]}>
              {technicians.map((tech) => <option key={tech.id} value={tech.id}>{tech.name}</option>)}
            </select>
            <Button disabled={isSaving || !approvedQuotes.length}>{isSaving ? 'Starting…' : 'Start job'}</Button>
          </form>
        </Modal>
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-[0_14px_28px_rgba(17,17,17,0.08)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.14em] text-gray-500">Active job</p>
          <h3 className="text-lg font-semibold text-black">{activeJob.title}</h3>
          <p className="text-xs text-gray-500">Started {activeJob.started_at ? new Date(activeJob.started_at).toLocaleString() : 'just now'} • Updated {new Date(activeJob.last_updated_at).toLocaleString()}</p>
        </div>
        <span className="rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">{formatJobCardStatus(activeJob.status)}</span>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {activeJob.assignments.map((assignment) => (
          <span key={assignment.id} className="rounded-full border border-neutral-200 bg-neutral-50 px-2 py-1 text-xs">{assignment.name}</span>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild size="sm"><Link href={`/workshop/jobs/${activeJob.id}`}>Open job</Link></Button>
        <form onSubmit={(event) => { event.preventDefault(); const status = String(new FormData(event.currentTarget).get('status') || 'in_progress'); void run(() => updateJobCardStatus({ jobId: activeJob.id, status: status as never })); }} className="flex gap-2">
          <select name="status" className="rounded-lg border border-neutral-300 px-2 text-xs">
            {JOB_CARD_STATUSES.filter((status) => status !== 'not_started').map((status) => <option key={status} value={status}>{formatJobCardStatus(status)}</option>)}
          </select>
          <Button size="sm" variant="secondary" type="submit">Change status</Button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); const message = String(new FormData(event.currentTarget).get('message') || ''); void run(() => addJobCardEvent({ jobId: activeJob.id, eventType: 'customer_update', note: message, customerFacing: true })); event.currentTarget.reset(); }} className="flex gap-2">
          <input name="message" placeholder="Customer update" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
          <Button size="sm" variant="secondary" type="submit">Post customer update</Button>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); const note = String(new FormData(event.currentTarget).get('note') || ''); void run(() => addJobCardEvent({ jobId: activeJob.id, eventType: 'approval_requested', note, customerFacing: true })); event.currentTarget.reset(); }} className="flex gap-2">
          <input name="note" placeholder="Approval request" className="rounded-lg border border-neutral-300 px-2 py-1 text-xs" />
          <Button size="sm" variant="secondary" type="submit">Request approval</Button>
        </form>
        {canClose ? <Button size="sm" variant="outline" onClick={() => void run(() => closeJobCard({ jobId: activeJob.id }), () => setInvoicePromptOpen(true), { reloadOnSuccess: false })}>Close job</Button> : null}
      </div>
      <Link href={`/workshop/jobs/${activeJob.id}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-black">View full internal timeline <ArrowRight className="h-3.5 w-3.5" /></Link>
      <Modal open={invoicePromptOpen} onClose={() => setInvoicePromptOpen(false)} title="Upload invoice now?">
        <p className="text-sm text-gray-600">The job card has been closed. You can upload the invoice now or do it later.</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => { setInvoicePromptOpen(false); window.location.reload(); }}>Cancel</Button>
          <Button onClick={() => { window.location.href = `/workshop/vehicles/${vehicleId}/documents`; }}>Upload invoice</Button>
        </div>
      </Modal>
    </div>
  );
}
