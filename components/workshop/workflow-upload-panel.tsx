'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

const DOCUMENT_TYPES = [
  { value: 'before_images', label: 'Before images', defaultSubject: 'Before images' },
  { value: 'after_images', label: 'After images', defaultSubject: 'After images' },
  { value: 'inspection', label: 'Inspection report', defaultSubject: 'Inspection report' },
  { value: 'quote', label: 'Quote', defaultSubject: 'Quote' },
  { value: 'invoice', label: 'Invoice', defaultSubject: 'Invoice' },
  { value: 'parts_list', label: 'Parts list', defaultSubject: 'Parts list' },
  { value: 'warranty', label: 'Warranty', defaultSubject: 'Warranty document' },
  { value: 'report', label: 'Report', defaultSubject: 'Workshop report' },
  { value: 'other', label: 'Other', defaultSubject: '' }
] as const;

type DocType = (typeof DOCUMENT_TYPES)[number]['value'];

export function WorkflowUploadPanel({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [documentType, setDocumentType] = useState<DocType>('inspection');
  const [subject, setSubject] = useState('Inspection report');
  const [body, setBody] = useState('');
  const [amount, setAmount] = useState('');
  const [importance, setImportance] = useState<'info' | 'warning' | 'urgent'>('info');
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isQuoteOrInvoice = documentType === 'quote' || documentType === 'invoice';
  const isOther = documentType === 'other';
  const allowMultiUpload = documentType === 'before_images' || documentType === 'after_images';

  async function uploadSingle(file: File) {
    const signResponse = await fetch('/api/uploads/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type, kind: file.type.startsWith('image/') ? 'image' : 'document', documentType })
    });
    if (!signResponse.ok) throw new Error((await signResponse.json()).error ?? 'Could not sign upload');

    const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };

    const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
      method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file
    });
    if (!uploadResponse.ok) throw new Error('Upload failed');

    const amountCents = amount ? Math.round(Number(amount) * 100) : undefined;
    const completeResponse = await fetch('/api/uploads/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId,
        bucket: signedPayload.bucket,
        path: signedPayload.path,
        contentType: file.type,
        size: file.size,
        originalName: file.name,
        docType: signedPayload.docType,
        subject,
        body,
        importance,
        amountCents
      })
    });

    if (!completeResponse.ok) throw new Error((await completeResponse.json()).error ?? 'Could not complete upload');
  }

  async function onUploadFiles(files: FileList | null) {
    if (!files?.length) return;
    setIsUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await uploadSingle(file);
      }
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-base font-semibold">Uploads / Actions</h2>
      <label className="block">Document type
        <select value={documentType} className="mt-1 w-full rounded border p-2" onChange={(event) => {
          const next = event.target.value as DocType;
          setDocumentType(next);
          const found = DOCUMENT_TYPES.find((entry) => entry.value === next);
          setSubject(found?.defaultSubject ?? '');
          setImportance('info');
        }}>
          {DOCUMENT_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
        </select>
      </label>

      <label className="block">Subject
        <input value={subject} onChange={(event) => setSubject(event.target.value)} required={isQuoteOrInvoice || isOther} className="mt-1 w-full rounded border p-2" placeholder="Document subject" />
      </label>

      {isQuoteOrInvoice ? <label className="block">Amount
        <input type="number" min="0" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} required className="mt-1 w-full rounded border p-2" />
      </label> : null}

      <label className="block">Body (optional)
        <textarea value={body} onChange={(event) => setBody(event.target.value)} className="mt-1 w-full rounded border p-2" rows={3} />
      </label>

      {!isQuoteOrInvoice ? <label className="block">Urgency
        <select value={importance} onChange={(event) => setImportance(event.target.value as 'info' | 'warning' | 'urgent')} className="mt-1 w-full rounded border p-2" required>
          <option value="info">Info</option>
          <option value="warning">Warning</option>
          <option value="urgent">Urgent</option>
        </select>
      </label> : null}

      <input ref={fileRef} type="file" accept="application/pdf,image/*" multiple={allowMultiUpload} className="hidden" onChange={(event) => { void onUploadFiles(event.target.files); event.currentTarget.value = ''; }} />
      <button type="button" disabled={isUploading || (isQuoteOrInvoice && !amount) || ((isQuoteOrInvoice || isOther) && !subject.trim())} onClick={() => fileRef.current?.click()} className="w-full rounded bg-black px-3 py-2 text-white disabled:opacity-50">
        {isUploading ? 'Uploading...' : allowMultiUpload ? 'Upload files' : 'Upload file'}
      </button>
      {error ? <p className="text-red-700">{error}</p> : null}
    </div>
  );
}
