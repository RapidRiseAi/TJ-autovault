'use client';

import { FormEvent, useState } from 'react';
import { createProblemReport } from '@/lib/actions/customer-vehicles';

type Attachment = { bucket: 'vehicle-files'; path: string; fileName?: string };

async function uploadAttachment(vehicleId: string, file: File): Promise<Attachment> {
  const signResponse = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleId,
      fileName: file.name,
      contentType: file.type,
      kind: file.type.startsWith('image/') ? 'image' : 'document',
      documentType: 'report'
    })
  });
  if (!signResponse.ok) throw new Error('Could not sign upload.');
  const signed = (await signResponse.json()) as { bucket: 'vehicle-files'; path: string; token: string; docType: 'report' };

  const uploadResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signed.bucket}/${signed.path}?token=${signed.token}`,
    { method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file }
  );
  if (!uploadResponse.ok) throw new Error('Could not upload file.');

  await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleId,
      bucket: signed.bucket,
      path: signed.path,
      contentType: file.type,
      size: file.size,
      originalName: file.name,
      docType: signed.docType,
      subject: 'Customer report attachment',
      body: 'Attached as part of issue report.'
    })
  });

  return { bucket: signed.bucket, path: signed.path, fileName: file.name };
}

export function ReportIssueForm({ vehicleId }: { vehicleId: string }) {
  const [category, setCategory] = useState<
    'vehicle' | 'noise' | 'engine' | 'brakes' | 'electrical' | 'other'
  >('vehicle');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);

    try {
      const attachment = file ? await uploadAttachment(vehicleId, file) : undefined;
      const result = await createProblemReport({
        vehicleId,
        category,
        subject,
        description: message,
        attachment
      });
      if (!result.ok) {
        setStatus(result.error);
        return;
      }
      setSubject('');
      setMessage('');
      setFile(null);
      setStatus('Problem reported successfully.');
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not submit report.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold">Report a problem</h2>
      <select
        className="w-full rounded border p-2"
        value={category}
        onChange={(e) => setCategory(e.target.value as typeof category)}
      >
        <option value="vehicle">Vehicle</option>
        <option value="noise">Noise</option>
        <option value="engine">Engine</option>
        <option value="brakes">Brakes</option>
        <option value="electrical">Electrical</option>
        <option value="other">Other</option>
      </select>
      <input className="w-full rounded border p-2" value={subject} onChange={(e) => setSubject(e.target.value)} required placeholder="Subject" spellCheck autoCorrect="on" autoCapitalize="sentences" />
      <textarea
        className="w-full rounded border p-2"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        required
        placeholder="Describe the issue"
        spellCheck
        autoCorrect="on"
        autoCapitalize="sentences"
      />
      <input type="file" className="w-full rounded border p-2" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting...' : 'Submit'}
      </button>
      {status ? <p className="text-sm">{status}</p> : null}
    </form>
  );
}
