'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createCustomerVehicle } from '@/lib/actions/customer-vehicles';

export function AddVehicleForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);
    const yearValue = formData.get('year')?.toString().trim() ?? '';
    const mileageValue = formData.get('currentMileage')?.toString().trim() ?? '';

    try {
      await createCustomerVehicle({
        registrationNumber: formData.get('registrationNumber')?.toString() ?? '',
        make: formData.get('make')?.toString() ?? '',
        model: formData.get('model')?.toString() ?? '',
        year: yearValue ? Number(yearValue) : null,
        vin: formData.get('vin')?.toString() ?? '',
        currentMileage: mileageValue ? Number(mileageValue) : null,
        notes: formData.get('notes')?.toString() ?? ''
      });

      router.refresh();
    } catch (submitError) {
      if (
        submitError &&
        typeof submitError === 'object' &&
        'digest' in submitError &&
        typeof submitError.digest === 'string' &&
        submitError.digest.startsWith('NEXT_REDIRECT')
      ) {
        throw submitError;
      }
      setError(submitError instanceof Error ? submitError.message : 'Could not add vehicle');
      setIsSubmitting(false);
    }
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label htmlFor="registrationNumber" className="mb-1 block text-sm font-medium">
          Registration / Plate number
        </label>
        <input id="registrationNumber" name="registrationNumber" className="w-full rounded border p-2" required />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label htmlFor="make" className="mb-1 block text-sm font-medium">
            Make
          </label>
          <input id="make" name="make" className="w-full rounded border p-2" required />
        </div>
        <div>
          <label htmlFor="model" className="mb-1 block text-sm font-medium">
            Model
          </label>
          <input id="model" name="model" className="w-full rounded border p-2" required />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="year" className="mb-1 block text-sm font-medium">
            Year
          </label>
          <input id="year" name="year" type="number" className="w-full rounded border p-2" min={1900} max={2100} />
        </div>
        <div>
          <label htmlFor="vin" className="mb-1 block text-sm font-medium">
            VIN
          </label>
          <input id="vin" name="vin" className="w-full rounded border p-2" />
        </div>
        <div>
          <label htmlFor="currentMileage" className="mb-1 block text-sm font-medium">
            Current mileage (km)
          </label>
          <input id="currentMileage" name="currentMileage" type="number" className="w-full rounded border p-2" min={0} />
        </div>
      </div>
      <div>
        <label htmlFor="notes" className="mb-1 block text-sm font-medium">
          Notes
        </label>
        <textarea id="notes" name="notes" className="w-full rounded border p-2" rows={4} />
      </div>
      <button type="submit" disabled={isSubmitting} className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">
        {isSubmitting ? 'Adding vehicle...' : 'Add vehicle'}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
