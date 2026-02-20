'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Paperclip } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { createCustomerTimelineLog } from '@/lib/actions/timeline';

type UploadedAttachment = {
  documentId: string;
  bucket: string;
  path: string;
  originalName: string;
  contentType: string;
  size: number;
};

async function uploadAttachment(vehicleId: string, file: File): Promise<UploadedAttachment> {
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

  if (!signResponse.ok) {
    const payload = (await signResponse.json()) as { error?: string };
    throw new Error(payload.error ?? 'Could not sign upload');
  }

  const signedPayload = (await signResponse.json()) as {
    bucket: string;
    path: string;
    token: string;
    docType: string;
  };

  const uploadResponse = await fetch(
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`,
    {
      method: 'PUT',
      headers: { 'Content-Type': file.type, 'x-upsert': 'true' },
      body: file
    }
  );

  if (!uploadResponse.ok) {
    throw new Error('File upload failed. Please try again.');
  }

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
      subject: `Manual timeline log attachment: ${file.name}`,
      body: 'Attachment uploaded from manual timeline logging.',
      importance: 'info'
    })
  });

  if (!completeResponse.ok) {
    const payload = (await completeResponse.json()) as { error?: string };
    throw new Error(payload.error ?? 'Could not save upload metadata');
  }

  const payload = (await completeResponse.json()) as { documentId: string; bucket: string; path: string };
  return {
    documentId: payload.documentId,
    bucket: payload.bucket,
    path: payload.path,
    originalName: file.name,
    contentType: file.type,
    size: file.size
  };
}

export function LogSomethingModal({
  vehicleId,
  open,
  onClose
}: {
  vehicleId: string;
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isSubmitting, startTransition] = useTransition();
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  function reset() {
    setTitle('');
    setDetails('');
    setFile(null);
    setFileError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function closeModal() {
    if (isSubmitting) return;
    reset();
    onClose();
  }

  function submit() {
    if (!title.trim()) {
      setFileError('Title is required.');
      return;
    }

    startTransition(async () => {
      setFileError(null);
      try {
        const attachment = file ? await uploadAttachment(vehicleId, file) : undefined;
        const result = await createCustomerTimelineLog({
          vehicleId,
          title,
          details,
          attachment
        });

        if (!result.ok) {
          setFileError(result.error);
          pushToast({ tone: 'error', title: 'Could not add log', description: result.error });
          return;
        }

        pushToast({ tone: 'success', title: 'Log added to timeline' });
        closeModal();
        router.refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not upload attachment.';
        setFileError(message);
        pushToast({ tone: 'error', title: 'Could not add log', description: message });
      }
    });
  }

  return (
    <Modal open={open} onClose={closeModal} title="Log something">
      <div className="space-y-3 text-sm">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Title</label>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Example: Replaced brake pads"
            className="w-full rounded border p-2"
            maxLength={120}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Details</label>
          <textarea
            value={details}
            onChange={(event) => setDetails(event.target.value)}
            rows={4}
            placeholder="Add optional notes about the service or repair."
            className="w-full rounded border p-2"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-700">Optional file attachment</label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,image/*"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            className="block w-full rounded border p-2 text-xs"
          />
          {file ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded border border-black/10 bg-zinc-50 px-2 py-1 text-xs text-gray-700">
              <Paperclip className="h-3.5 w-3.5" /> {file.name}
            </p>
          ) : null}
        </div>
        {fileError ? <p className="text-xs text-red-700">{fileError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={closeModal} disabled={isSubmitting}>Cancel</Button>
          <Button type="button" onClick={submit} disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            {isSubmitting ? 'Saving...' : 'Submit log'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
