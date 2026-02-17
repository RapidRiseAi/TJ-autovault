'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

async function upload(vehicleId: string, file: File, documentType: 'report' | 'vehicle_photo', subject: string, importance: 'info' | 'warning' | 'urgent' = 'info') {
  const signResponse = await fetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId, fileName: file.name, contentType: file.type, kind: file.type.startsWith('image/') ? 'image' : 'document', documentType })
  });
  if (!signResponse.ok) throw new Error((await signResponse.json()).error ?? 'Could not sign upload');
  const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };

  const uploadResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
    method: 'PUT', headers: { 'Content-Type': file.type, 'x-upsert': 'true' }, body: file
  });
  if (!uploadResponse.ok) throw new Error('Upload failed');

  const completeResponse = await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vehicleId, bucket: signedPayload.bucket, path: signedPayload.path, contentType: file.type, size: file.size, originalName: file.name, docType: signedPayload.docType, subject, importance })
  });
  if (!completeResponse.ok) throw new Error((await completeResponse.json()).error ?? 'Could not save upload');
}

export function CustomerUploadActions({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const reportRef = useRef<HTMLInputElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  async function onChoose(file: File | null, type: 'report' | 'vehicle_photo') {
    if (!file) return;
    setError(null);
    try {
      await upload(vehicleId, file, type, type === 'vehicle_photo' ? 'Vehicle photo updated' : 'Customer report');
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    }
  }

  return <div className="space-y-2 text-sm"><h3 className="font-semibold">Uploads</h3><div className="flex flex-wrap gap-2"><button type="button" onClick={() => reportRef.current?.click()} className="rounded border px-3 py-2">Upload report</button><button type="button" onClick={() => photoRef.current?.click()} className="rounded border px-3 py-2">Update vehicle photo</button></div><input ref={reportRef} type="file" className="hidden" accept="application/pdf,image/*" onChange={(e)=>{void onChoose(e.target.files?.[0]??null,'report'); e.currentTarget.value='';}}/><input ref={photoRef} type="file" className="hidden" accept="image/*" onChange={(e)=>{void onChoose(e.target.files?.[0]??null,'vehicle_photo'); e.currentTarget.value='';}}/>{error?<p className="text-red-700">{error}</p>:null}</div>;
}
