'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';

const DOCUMENT_TYPES = [
  { value: 'inspection_report', label: 'Inspection report', defaultSubject: 'Inspection report' },
  { value: 'quote', label: 'Quote', defaultSubject: 'Quote' },
  { value: 'invoice', label: 'Invoice', defaultSubject: 'Invoice' },
  { value: 'warning', label: 'Warning', defaultSubject: 'Warning notice' }
] as const;

type DocType = (typeof DOCUMENT_TYPES)[number]['value'];
type Urgency = 'info' | 'low' | 'medium' | 'high' | 'critical';

export function UploadsActionsForm({ vehicleId, onSuccess, destinationLabel = 'customer timeline' }: { vehicleId: string; onSuccess?: () => void; destinationLabel?: string }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [documentType, setDocumentType] = useState<DocType>('inspection_report');
  const [subject, setSubject] = useState('Inspection report');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('info');
  const [amount, setAmount] = useState('');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isQuoteOrInvoice = documentType === 'quote' || documentType === 'invoice';
  const isInvoice = documentType === 'invoice';
  const isWarning = documentType === 'warning';

  const disableSubmit = useMemo(
    () => isSubmitting || !file || !subject.trim() || (isQuoteOrInvoice && (!amount || !referenceNumber.trim())) || (isWarning && !body.trim()),
    [amount, body, file, isQuoteOrInvoice, isSubmitting, isWarning, referenceNumber, subject]
  );

  async function submitUpload(uploadFile: File) {
    setIsSubmitting(true);
    setError(null);

    try {
      const signResponse = await fetch('/api/uploads/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicleId, fileName: uploadFile.name, contentType: uploadFile.type, kind: uploadFile.type.startsWith('image/') ? 'image' : 'document', documentType }) });
      if (!signResponse.ok) throw new Error((await signResponse.json()).error ?? 'Could not sign upload');

      const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
        method: 'PUT', headers: { 'Content-Type': uploadFile.type, 'x-upsert': 'true' }, body: uploadFile
      });
      if (!uploadResponse.ok) throw new Error('Upload failed');

      const completeResponse = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, bucket: signedPayload.bucket, path: signedPayload.path, contentType: uploadFile.type, size: uploadFile.size, originalName: uploadFile.name, docType: signedPayload.docType,
          subject: subject.trim(), body: body.trim() || undefined, urgency: isWarning ? 'high' : urgency, amountCents: isQuoteOrInvoice ? Math.round(Number(amount) * 100) : undefined, referenceNumber: isQuoteOrInvoice ? referenceNumber.trim() : undefined, dueDate: isInvoice && dueDate ? dueDate : undefined
        })
      });
      if (!completeResponse.ok) throw new Error((await completeResponse.json()).error ?? 'Could not complete upload');

      pushToast({ title: 'Upload completed', tone: 'success' });
      onSuccess?.();
      router.refresh();
    } catch (uploadError) {
      const message = uploadError instanceof Error ? uploadError.message : 'Upload failed';
      pushToast({ title: 'Upload failed', description: message, tone: 'error' });
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;
    setConfirmOpen(true);
  }

  return (
    <form className="space-y-4" onSubmit={onSubmit}>
      <label className="block text-sm font-medium">Document type
        <select value={documentType} className="mt-1 w-full rounded border p-2" onChange={(event) => { const next = event.target.value as DocType; setDocumentType(next); setSubject(DOCUMENT_TYPES.find((entry) => entry.value === next)?.defaultSubject ?? ''); }}>
          {DOCUMENT_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </label>
      <label className="block text-sm font-medium">Urgency
        <select value={urgency} onChange={(event) => setUrgency(event.target.value as Urgency)} className="mt-1 w-full rounded border p-2">
          <option value="info">Info</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
        </select>
      </label>
      <label className="block text-sm font-medium">Subject
        <input value={subject} onChange={(event) => setSubject(event.target.value)} required className="mt-1 w-full rounded border p-2" />
      </label>
      {isQuoteOrInvoice ? <label className="block text-sm font-medium">Amount<input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-1 w-full rounded border p-2" /></label> : null}
      {isQuoteOrInvoice ? <label className="block text-sm font-medium">{documentType === 'invoice' ? 'Invoice reference number' : 'Quote reference number'}<input value={referenceNumber} onChange={(event) => setReferenceNumber(event.target.value)} required className="mt-1 w-full rounded border p-2" placeholder={documentType === 'invoice' ? 'INV-0001' : 'QTE-0001'} /></label> : null}
      {isInvoice ? <label className="block text-sm font-medium">Due date (optional)<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded border p-2" /></label> : null}
      <label className="block text-sm font-medium">Body / notes<textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 w-full rounded border p-2" rows={3} /></label>
      <label className="block text-sm font-medium">File<input type="file" accept="application/pdf,image/*" required className="mt-1 block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button type="submit" disabled={disableSubmit} className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50">{isSubmitting ? 'Uploading...' : 'Upload file'}</button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm upload">
        <div className="space-y-4 text-sm">
          <p>Upload this file?</p>
          <dl className="space-y-1 rounded border border-black/10 bg-zinc-50 p-3">
            <div><dt className="font-medium">File name</dt><dd>{file?.name ?? 'Unknown file'}</dd></div>
            <div><dt className="font-medium">Upload type</dt><dd>{DOCUMENT_TYPES.find((entry) => entry.value === documentType)?.label ?? documentType}</dd></div>
            <div><dt className="font-medium">Destination</dt><dd>{destinationLabel}</dd></div>
          </dl>
          <div className="flex justify-end gap-2">
            <button type="button" className="rounded border px-3 py-2" onClick={() => setConfirmOpen(false)}>Cancel</button>
            <button type="button" disabled={isSubmitting || !file} className="rounded bg-black px-3 py-2 text-white disabled:opacity-50" onClick={() => {
              if (!file) return;
              setConfirmOpen(false);
              void submitUpload(file);
            }}>Confirm upload</button>
          </div>
        </div>
      </Modal>
    </form>
  );
}
