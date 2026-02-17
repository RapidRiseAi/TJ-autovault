'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

type Attachment = {
  id: string;
  bucket: string | null;
  storage_path: string;
  original_name: string | null;
  mime_type: string;
  size_bytes: number | null;
  created_at: string;
};

type UploadKind = 'image' | 'document';

export function UploadsSection({ vehicleId, attachments }: { vehicleId: string; attachments: Attachment[] }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);

  async function uploadFile(file: File, kind: UploadKind) {
    setError(null);
    setIsUploading(true);

    try {
      const signResponse = await fetch('/api/uploads/sign', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type, kind })
      });
      if (!signResponse.ok) throw new Error((await signResponse.json()).error ?? 'Could not sign upload');

      const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };
      const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
        method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'false' }, body: file
      });
      if (!uploadResponse.ok) throw new Error('Upload failed');

      const completeResponse = await fetch('/api/uploads/complete', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId, bucket: signedPayload.bucket, path: signedPayload.path, contentType: file.type, size: file.size, originalName: file.name, docType: signedPayload.docType })
      });
      if (!completeResponse.ok) throw new Error((await completeResponse.json()).error ?? 'Could not save upload metadata');
      router.refresh();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Upload failed');
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Documents</h2>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={isUploading} onClick={() => imageInputRef.current?.click()} className="rounded bg-brand-red px-3 py-2 text-sm text-white disabled:opacity-50">Upload image</button>
        <button type="button" disabled={isUploading} onClick={() => docInputRef.current?.click()} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Upload document</button>
      </div>
      <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file, 'image'); event.currentTarget.value = ''; }} />
      <input ref={docInputRef} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadFile(file, 'document'); event.currentTarget.value = ''; }} />
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <ul className="space-y-2 text-sm">
        {attachments.length === 0 ? <li className="text-gray-600">No uploads yet.</li> : null}
        {attachments.map((attachment) => <li key={attachment.id} className="flex items-center justify-between gap-2 rounded border p-2"><span className="truncate">{attachment.original_name ?? attachment.storage_path.split('/').at(-1)}</span><a href={`/api/uploads/download?bucket=${encodeURIComponent(attachment.bucket ?? '')}&path=${encodeURIComponent(attachment.storage_path)}`} className="text-brand-red underline">Download</a></li>)}
      </ul>
    </div>
  );
}
