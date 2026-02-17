'use client';

import { FormEvent, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomerVehicle } from '@/lib/actions/customer-vehicles';
import { VEHICLE_MAKES, VEHICLE_MODELS_BY_MAKE } from '@/lib/vehicle-makes-models';

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const REGISTRATION_REGEX = /^[A-Z0-9\- ]{4,12}$/;

function SearchableDropdown({
  id,
  label,
  value,
  options,
  placeholder,
  onChange,
  disabled
}: {
  id: string;
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const listId = `${id}-options`;

  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-medium">{label}</label>
      <input
        id={id}
        list={listId}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded border p-2 disabled:cursor-not-allowed disabled:bg-gray-100"
      />
      <datalist id={listId}>
        {options.map((entry) => (
          <option key={entry} value={entry} />
        ))}
      </datalist>
    </div>
  );
}

export function AddVehicleForm() {
  const router = useRouter();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [vehiclePhoto, setVehiclePhoto] = useState<File | null>(null);
  const photoRef = useRef<HTMLInputElement>(null);

  const normalizedMake = useMemo(
    () => VEHICLE_MAKES.find((entry) => entry.toLowerCase() === make.trim().toLowerCase()) ?? make.trim(),
    [make]
  );

  const modelOptions = useMemo(() => {
    if (!normalizedMake || normalizedMake === 'Other') return ['Other'];
    return VEHICLE_MODELS_BY_MAKE[normalizedMake] ?? ['Other'];
  }, [normalizedMake]);

  function validate(formData: FormData) {
    const errors: Record<string, string> = {};
    const registrationNumber = (formData.get('registrationNumber')?.toString() ?? '').trim().toUpperCase();
    const vin = (formData.get('vin')?.toString() ?? '').trim().toUpperCase();
    const yearRaw = formData.get('year')?.toString() ?? '';
    const mileageRaw = formData.get('currentMileage')?.toString() ?? '';

    if (!REGISTRATION_REGEX.test(registrationNumber)) {
      errors.registrationNumber = 'Registration must be 4-12 chars using letters, numbers, spaces, or hyphen.';
    }

    if (vin && !VIN_REGEX.test(vin)) {
      errors.vin = 'VIN must be exactly 17 chars and exclude I, O, Q.';
    }

    if (yearRaw) {
      const year = Number(yearRaw);
      const maxYear = new Date().getFullYear() + 1;
      if (!Number.isInteger(year) || year < 1900 || year > maxYear) {
        errors.year = `Year must be between 1900 and ${maxYear}.`;
      }
    }

    if (mileageRaw) {
      const mileage = Number(mileageRaw);
      if (!Number.isInteger(mileage) || mileage < 0) {
        errors.currentMileage = 'Mileage must be a whole number greater than or equal to 0.';
      }
    }

    if (!normalizedMake) errors.make = 'Please select a make.';
    if (normalizedMake && normalizedMake !== 'Other' && !model.trim()) errors.model = 'Please select a model.';

    if (normalizedMake === 'Other' && !(formData.get('manualMake')?.toString() ?? '').trim()) {
      errors.manualMake = 'Please enter a custom make.';
    }

    if ((model.trim() === 'Other' || normalizedMake === 'Other') && !(formData.get('manualModel')?.toString() ?? '').trim()) {
      errors.manualModel = 'Please enter a custom model.';
    }

    return errors;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const errors = validate(formData);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) return;

    setIsSubmitting(true);
    setError(null);

    const normalizedModel = modelOptions.find((entry) => entry.toLowerCase() === model.trim().toLowerCase()) ?? model.trim();

    const result = await createCustomerVehicle({
      registrationNumber: formData.get('registrationNumber')?.toString() ?? '',
      make: normalizedMake === 'Other' ? formData.get('manualMake')?.toString() ?? '' : normalizedMake,
      model: normalizedModel === 'Other' || normalizedMake === 'Other' ? formData.get('manualModel')?.toString() ?? '' : normalizedModel,
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
        body: JSON.stringify({ vehicleId: result.vehicleId, fileName: vehiclePhoto.name, contentType: vehiclePhoto.type, kind: 'image', documentType: 'vehicle_photo' })
      });
      if (signResponse.ok) {
        const signedPayload = (await signResponse.json()) as { bucket: string; path: string; token: string; docType: string };
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/upload/sign/${signedPayload.bucket}/${signedPayload.path}?token=${signedPayload.token}`, {
          method: 'PUT', headers: { 'Content-Type': vehiclePhoto.type, 'x-upsert': 'true' }, body: vehiclePhoto
        });
        await fetch('/api/uploads/complete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vehicleId: result.vehicleId, bucket: signedPayload.bucket, path: signedPayload.path, contentType: vehiclePhoto.type, size: vehiclePhoto.size, originalName: vehiclePhoto.name, docType: signedPayload.docType, subject: 'Vehicle photo updated', urgency: 'info' })
        });
      }
    }

    router.push(`/customer/vehicles/${result.vehicleId}`);
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label htmlFor="registrationNumber" className="mb-1 block text-sm font-medium">Registration / Plate number</label>
        <input id="registrationNumber" name="registrationNumber" className="w-full rounded border p-2 uppercase" required minLength={4} maxLength={12} />
        {fieldErrors.registrationNumber ? <p className="text-sm text-red-700">{fieldErrors.registrationNumber}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <SearchableDropdown
            id="vehicle-make"
            label="Make"
            value={make}
            options={VEHICLE_MAKES}
            placeholder="Search and select make"
            onChange={(next) => {
              setMake(next);
              setModel('');
            }}
          />
          {fieldErrors.make ? <p className="text-sm text-red-700">{fieldErrors.make}</p> : null}
          {normalizedMake === 'Other' ? <input name="manualMake" className="mt-2 w-full rounded border p-2" placeholder="Enter make" required /> : null}
          {fieldErrors.manualMake ? <p className="text-sm text-red-700">{fieldErrors.manualMake}</p> : null}
        </div>
        <div>
          <SearchableDropdown
            id="vehicle-model"
            label="Model"
            value={model}
            options={modelOptions}
            placeholder={normalizedMake ? 'Search and select model' : 'Select make first'}
            disabled={!normalizedMake}
            onChange={setModel}
          />
          {fieldErrors.model ? <p className="text-sm text-red-700">{fieldErrors.model}</p> : null}
          {model.trim() === 'Other' || normalizedMake === 'Other' ? <input name="manualModel" className="mt-2 w-full rounded border p-2" placeholder="Enter model" required /> : null}
          {fieldErrors.manualModel ? <p className="text-sm text-red-700">{fieldErrors.manualModel}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div><label htmlFor="year" className="mb-1 block text-sm font-medium">Year</label><input id="year" name="year" type="number" min={1900} max={new Date().getFullYear() + 1} className="w-full rounded border p-2" />{fieldErrors.year ? <p className="text-sm text-red-700">{fieldErrors.year}</p> : null}</div>
        <div><label htmlFor="vin" className="mb-1 block text-sm font-medium">VIN (optional)</label><input id="vin" name="vin" className="w-full rounded border p-2 uppercase" maxLength={17} />{fieldErrors.vin ? <p className="text-sm text-red-700">{fieldErrors.vin}</p> : null}</div>
        <div><label htmlFor="currentMileage" className="mb-1 block text-sm font-medium">Current mileage (km)</label><input id="currentMileage" name="currentMileage" type="number" min={0} className="w-full rounded border p-2" />{fieldErrors.currentMileage ? <p className="text-sm text-red-700">{fieldErrors.currentMileage}</p> : null}</div>
      </div>

      <textarea name="notes" className="w-full rounded border p-2" rows={3} placeholder="Notes" />
      <div>
        <label className="mb-1 block text-sm font-medium">Vehicle photo (optional)</label>
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => photoRef.current?.click()} className="rounded border px-3 py-2 text-sm">Choose image</button>
          <span className="text-xs text-gray-600">{vehiclePhoto?.name ?? 'No file selected'}</span>
        </div>
        <input ref={photoRef} type="file" accept="image/*" className="hidden" onChange={(event) => setVehiclePhoto(event.target.files?.[0] ?? null)} />
      </div>
      <button type="submit" disabled={isSubmitting} className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">{isSubmitting ? 'Adding vehicle...' : 'Add vehicle'}</button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
