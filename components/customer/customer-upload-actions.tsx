'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { useToast } from '@/components/ui/toast-provider';

async function upload(
  vehicleId: string,
  file: File,
  documentType: 'report' | 'vehicle_photo',
  subject: string,
  importance: 'info' | 'warning' | 'urgent' = 'info'
) {
  const signResponse = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vehicleId,
      fileName: file.name,
      contentType: file.type,
      kind: file.type.startsWith('image/') ? 'image' : 'document',
      documentType
    })
  });
  if (!signResponse.ok) {
    throw new Error(
      (await signResponse.json()).error ?? 'Could not sign upload'
    );
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
  if (!uploadResponse.ok) throw new Error('Upload failed');

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
      importance
    })
  });
  if (!completeResponse.ok) {
    throw new Error(
      (await completeResponse.json()).error ?? 'Could not save upload'
    );
  }
}

type UploadResult =
  | { tone: 'success'; message: string }
  | { tone: 'error'; message: string }
  | null;

export function CustomerUploadActions({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const reportRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const { pushToast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [activeType, setActiveType] = useState<
    'report' | 'vehicle_photo' | null
  >(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [result, setResult] = useState<UploadResult>(null);
  const [uploadedState, setUploadedState] = useState(false);

  async function onChoose(file: File | null, type: 'report' | 'vehicle_photo') {
    if (!file) return;
    setSelectedFileName(file.name);
    setResult(null);
    setActiveType(type);

    try {
      setIsUploading(true);
      await upload(
        vehicleId,
        file,
        type,
        type === 'vehicle_photo' ? 'Vehicle photo updated' : 'Customer report'
      );
      router.refresh();
      setResult({ tone: 'success', message: 'Upload successful.' });
      setUploadedState(true);
      pushToast({ tone: 'success', title: 'Upload successful' });
      window.setTimeout(() => setUploadedState(false), 2800);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed';
      setResult({ tone: 'error', message });
      pushToast({
        tone: 'error',
        title: 'Upload failed',
        description: message
      });
    } finally {
      setIsUploading(false);
      setActiveType(null);
    }
  }

  return (
    <div className="space-y-3 text-sm">
      <h3 className="font-semibold">Uploads</h3>
      <p className="text-xs text-gray-500">
        Upload reports or replace the current vehicle photo.
      </p>

      {selectedFileName ? (
        <p className="rounded-lg border border-black/10 bg-zinc-50 px-2 py-1 text-xs text-gray-600">
          Selected file:{' '}
          <span className="font-medium text-black">{selectedFileName}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={isUploading}
          onClick={() => reportRef.current?.click()}
          className="inline-flex items-center rounded-xl border border-black/15 px-3 py-2 disabled:opacity-50"
        >
          {isUploading && activeType === 'report' ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : null}
          {isUploading && activeType === 'report'
            ? 'Uploading...'
            : 'Upload report'}
        </button>
        <button
          type="button"
          disabled={isUploading}
          onClick={() => photoRef.current?.click()}
          className="inline-flex items-center rounded-xl border border-black/15 px-3 py-2 disabled:opacity-50"
        >
          {isUploading && activeType === 'vehicle_photo' ? (
            <Loader2 className="mr-1 h-4 w-4 animate-spin" />
          ) : null}
          {isUploading && activeType === 'vehicle_photo'
            ? 'Uploading...'
            : 'Update vehicle photo'}
        </button>
      </div>

      {uploadedState ? (
        <p className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-xs text-emerald-700">
          <CheckCircle2 className="h-3.5 w-3.5" /> Uploaded
        </p>
      ) : null}

      <div className="min-h-8 rounded-lg border border-black/10 bg-zinc-50 px-2 py-1 text-xs">
        {result ? (
          <span
            className={`inline-flex items-center gap-1 ${result.tone === 'success' ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {result.tone === 'success' ? (
              <CheckCircle2 className="h-3.5 w-3.5" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
            {result.message}
          </span>
        ) : (
          <span className="text-gray-500">
            Last upload result will appear here.
          </span>
        )}
      </div>

      <input
        ref={reportRef}
        type="file"
        className="hidden"
        accept="application/pdf,image/*"
        onChange={(e) => {
          void onChoose(e.target.files?.[0] ?? null, 'report');
          e.currentTarget.value = '';
        }}
      />
      <input
        ref={photoRef}
        type="file"
        className="hidden"
        accept="image/*"
        onChange={(e) => {
          void onChoose(e.target.files?.[0] ?? null, 'vehicle_photo');
          e.currentTarget.value = '';
        }}
      />
    </div>
  );
}
