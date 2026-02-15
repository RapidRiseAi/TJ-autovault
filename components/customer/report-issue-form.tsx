'use client';

import Image from 'next/image';
import { FormEvent, useMemo, useState } from 'react';
import { createCustomerReport } from '@/lib/actions/customer-reports';
import { appConfig } from '@/lib/config/app-config';

type UploadItem = {
  id: string;
  name: string;
  mimeType: string;
  previewUrl: string;
  progress: number;
  status: 'queued' | 'uploading' | 'done' | 'error';
  storagePath?: string;
};

async function compressImage(file: File) {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  const maxEdge = 1600;
  const ratio = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
  canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Cannot process image');
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
  bitmap.close();
  if (!blob) throw new Error('Compression failed');
  return new File([blob], file.name.replace(/\.(png|webp)$/i, '.jpg'), { type: 'image/jpeg' });
}

async function uploadWithProgress(url: string, file: File, onProgress: (value: number) => void) {
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', file.type);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`Upload failed: ${xhr.responseText || xhr.status}`));
    };
    xhr.onerror = () => reject(new Error('Upload failed'));
    xhr.send(file);
  });
}

export function ReportIssueForm({ vehicleId }: { vehicleId: string }) {
  const maxFiles = appConfig.uploads.maxImagesPerReport;
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [requestQuote, setRequestQuote] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => title.trim() && description.trim() && !isSubmitting, [title, description, isSubmitting]);

  async function onSelectFiles(files: FileList | null) {
    if (!files) return;

    const nextFiles = Array.from(files).slice(0, Math.max(0, maxFiles - uploads.length));
    const valid = nextFiles.filter((file) => appConfig.uploads.allowedImageMimeTypes.some((mimeType) => mimeType === file.type));

    const compressedFiles = await Promise.all(valid.map((file) => compressImage(file)));

    const items = compressedFiles.map((file) => ({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type,
      previewUrl: URL.createObjectURL(file),
      progress: 0,
      status: 'queued' as const,
      file
    }));

    setUploads((prev) => [
      ...prev,
      ...items.map((item) => ({
        id: item.id,
        name: item.name,
        mimeType: item.mimeType,
        previewUrl: item.previewUrl,
        progress: item.progress,
        status: item.status
      }))
    ]);

    for (const item of items) {
      try {
        setUploads((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, status: 'uploading' } : entry)));

        const uploadUrlResponse = await fetch('/api/customer/reports/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId, fileName: item.name, contentType: item.mimeType })
        });

        if (!uploadUrlResponse.ok) throw new Error('Could not prepare upload URL');

        const uploadData: { signedUrl: string; path: string } = await uploadUrlResponse.json();

        await uploadWithProgress(uploadData.signedUrl, item.file, (progress) => {
          setUploads((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, progress } : entry)));
        });

        setUploads((prev) =>
          prev.map((entry) =>
            entry.id === item.id
              ? { ...entry, status: 'done', progress: 100, storagePath: uploadData.path }
              : entry
          )
        );
      } catch {
        setUploads((prev) => prev.map((entry) => (entry.id === item.id ? { ...entry, status: 'error' } : entry)));
      }
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setIsSubmitting(true);

    try {
      const attachmentPayload = uploads
        .filter((item) => item.status === 'done' && item.storagePath)
        .map((item) => ({ path: item.storagePath!, mimeType: item.mimeType }));

      await createCustomerReport({
        vehicleId,
        title,
        description,
        priority,
        requestQuote,
        attachments: attachmentPayload
      });

      setTitle('');
      setDescription('');
      setPriority('medium');
      setRequestQuote(true);
      setUploads([]);
      setMessage('Report submitted successfully.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not submit report');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold">Report a new issue</h2>
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        className="w-full rounded border p-2"
        placeholder="Title"
        required
      />
      <textarea
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        className="w-full rounded border p-2"
        placeholder="Description"
        rows={4}
        required
      />
      <select
        className="w-full rounded border p-2"
        value={priority}
        onChange={(event) => setPriority(event.target.value as 'low' | 'medium' | 'high')}
      >
        <option value="low">Low</option>
        <option value="medium">Medium</option>
        <option value="high">High</option>
      </select>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={requestQuote}
          onChange={(event) => setRequestQuote(event.target.checked)}
        />
        Request quote for suggested fixes
      </label>
      <div className="space-y-2">
        <input
          className="w-full rounded border p-2"
          type="file"
          accept={appConfig.uploads.allowedImageMimeTypes.join(',')}
          multiple
          onChange={(event) => void onSelectFiles(event.target.files)}
        />
        <p className="text-xs text-gray-600">Up to {maxFiles} images per report.</p>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {uploads.map((item) => (
          <div key={item.id} className="rounded border p-2">
            <Image src={item.previewUrl} alt={item.name} width={160} height={80} className="h-20 w-full rounded object-cover" unoptimized />
            <p className="mt-1 truncate text-xs">{item.name}</p>
            <p className="text-xs">{item.status === 'done' ? 'Uploaded' : `${item.progress}%`}</p>
          </div>
        ))}
      </div>
      <button
        type="submit"
        disabled={!canSubmit}
        className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50"
      >
        {isSubmitting ? 'Submitting...' : 'Submit report'}
      </button>
      {message ? <p className="text-sm">{message}</p> : null}
    </form>
  );
}
