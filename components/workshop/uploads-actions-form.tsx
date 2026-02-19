'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from '@/components/ui/toast-provider';

const DOCUMENT_TYPES = [
  { value: 'inspection_report', label: 'Inspection report', defaultSubject: 'Inspection report' },
  { value: 'quote', label: 'Quote', defaultSubject: 'Quote' },
  { value: 'invoice', label: 'Invoice', defaultSubject: 'Invoice' },
  { value: 'warning', label: 'Warning', defaultSubject: 'Warning notice' }
] as const;

type DocType = (typeof DOCUMENT_TYPES)[number]['value'];
type Urgency = 'info' | 'low' | 'medium' | 'high' | 'critical';

export function UploadsActionsForm({ vehicleId, onSuccess }: { vehicleId: string; onSuccess?: () => void }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [documentType, setDocumentType] = useState<DocType>('inspection_report');
  const [subject, setSubject] = useState('Inspection report');
  const [body, setBody] = useState('');
  const [urgency, setUrgency] = useState<Urgency>('info');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isQuoteOrInvoice = documentType === 'quote' || documentType === 'invoice';
  const isInvoice = documentType === 'invoice';
  const isWarning = documentType === 'warning';

  const disableSubmit = useMemo(
    () => isSubmitting || !file || !subject.trim() || (isQuoteOrInvoice && !amount) || (isWarning && !body.trim()),
    [amount, body, file, isQuoteOrInvoice, isSubmitting, isWarning, subject]
  );

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const signResponse = await fetch('/api/uploads/sign', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type, kind: file.type.startsWith('image/') ? 'image' : 'document', documentType }) });
      if (!signResponse.ok) throw new Error((await signResponse.json()).error ?? 'Could not sign upload');

      const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
        method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file
      });
      if (!uploadResponse.ok) throw new Error('Upload failed');

      const completeResponse = await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId, bucket: signedPayload.bucket, path: signedPayload.path, contentType: file.type, size: file.size, originalName: file.name, docType: signedPayload.docType,
          subject: subject.trim(), body: body.trim() || undefined, urgency: isWarning ? 'high' : urgency, amountCents: isQuoteOrInvoice ? Math.round(Number(amount) * 100) : undefined, dueDate: isInvoice && dueDate ? dueDate : undefined
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
      {isInvoice ? <label className="block text-sm font-medium">Due date (optional)<input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="mt-1 w-full rounded border p-2" /></label> : null}
      <label className="block text-sm font-medium">Body / notes<textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 w-full rounded border p-2" rows={3} /></label>
      <label className="block text-sm font-medium">File<input type="file" accept="application/pdf,image/*" required className="mt-1 block w-full text-sm" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /></label>
      <button type="submit" disabled={disableSubmit} className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50">{isSubmitting ? 'Uploading...' : 'Upload file'}</button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
