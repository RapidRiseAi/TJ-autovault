'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { updateCustomerVehicle } from '@/lib/actions/customer-vehicles';

type Vehicle = {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometer_km: number | null;
};

export function EditVehicleForm({ vehicle }: { vehicle: Vehicle }) {
  const router = useRouter();
  const photoRef = useRef<HTMLInputElement>(null);
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const formData = new FormData(event.currentTarget);
    const result = await updateCustomerVehicle({
      vehicleId: vehicle.id,
      registrationNumber: formData.get('registrationNumber')?.toString() ?? '',
      make: formData.get('make')?.toString() ?? '',
      model: formData.get('model')?.toString() ?? '',
      year: formData.get('year') ? Number(formData.get('year')) : null,
      vin: formData.get('vin')?.toString() ?? '',
      currentMileage: formData.get('currentMileage') ? Number(formData.get('currentMileage')) : null,
      notes: formData.get('notes')?.toString() ?? ''
    });

    if (!result.ok) {
      setError(result.error);
      setIsSubmitting(false);
      return;
    }

    if (vehiclePhoto) {
      const signResponse = await fetch('/api/uploads/sign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: vehicle.id, fileName: vehiclePhoto.name, contentType: vehiclePhoto.type, kind: 'image', documentType: 'vehicle_photo' })
      });
      if (!signResponse.ok) {
        setError((await signResponse.json()).error ?? 'Could not sign image upload');
        setIsSubmitting(false);
        return;
      }

      const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };
      await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
        method: 'PUT', headers: { 'Content-Type': vehiclePhoto.type, 'x-upsert': 'true' }, body: vehiclePhoto
      });
      await fetch('/api/uploads/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vehicleId: vehicle.id, bucket: signedPayload.bucket, path: signedPayload.path, contentType: vehiclePhoto.type, size: vehiclePhoto.size, originalName: vehiclePhoto.name, docType: signedPayload.docType, subject: 'Vehicle photo updated', urgency: 'info' })
      });
    }

    router.push(`/customer/vehicles/${vehicle.id}`);
    router.refresh();
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <input name="registrationNumber" defaultValue={vehicle.registration_number} required className="w-full rounded border p-2 uppercase" />
      <div className="grid gap-3 md:grid-cols-2">
        <input name="make" defaultValue={vehicle.make ?? ''} required className="w-full rounded border p-2" placeholder="Make" />
        <input name="model" defaultValue={vehicle.model ?? ''} required className="w-full rounded border p-2" placeholder="Model" />
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <input name="year" type="number" defaultValue={vehicle.year ?? ''} className="w-full rounded border p-2" placeholder="Year" />
        <input name="vin" defaultValue={vehicle.vin ?? ''} className="w-full rounded border p-2 uppercase" placeholder="VIN" />
        <input name="currentMileage" type="number" defaultValue={vehicle.odometer_km ?? ''} className="w-full rounded border p-2" placeholder="Mileage" />
      </div>
      <textarea name="notes" className="w-full rounded border p-2" rows={3} placeholder="Notes" />
      <div>
        <label className="mb-1 block text-sm font-medium">Replace vehicle photo (optional)</label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => photoRef.current?.click()} className="rounded border px-3 py-2 text-sm">Choose image</button>
          <span className="text-xs text-gray-600">{vehiclePhoto?.name ?? 'No file selected'}</span>
        </div>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(event) => setVehiclePhoto(event.target.files?.[0] ?? null)} />
      </div>
      <button type="submit" disabled={isSubmitting} className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">{isSubmitting ? 'Saving...' : 'Save vehicle'}</button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
