'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomerVehicle } from '@/lib/actions/customer-vehicles';
import { getModelsForMake, getVehicleMakes } from '@/lib/vehicle-data';

const makes = getVehicleMakes();

export function AddVehicleForm() {
  const router = useRouter();
  const [make, setMake] = useState(makes[0] ?? 'Other');
  const [model, setModel] = useState('Other');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const models = useMemo(() => getModelsForMake(make), [make]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(null);
    const formData = new FormData(event.currentTarget);

    const result = await createCustomerVehicle({
      registrationNumber: formData.get('registrationNumber')?.toString() ?? '',
      make: make === 'Other' ? formData.get('manualMake')?.toString() ?? '' : make,
      model: model === 'Other' ? formData.get('manualModel')?.toString() ?? '' : model,
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

    router.push(`/customer/vehicles/${result.vehicleId}`);
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <div>
        <label htmlFor="registrationNumber" className="mb-1 block text-sm font-medium">Registration / Plate number</label>
        <input id="registrationNumber" name="registrationNumber" className="w-full rounded border p-2 uppercase" required minLength={3} maxLength={12} pattern="[A-Za-z0-9-]{3,12}" />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Make</label>
          <select value={make} onChange={(e) => { setMake(e.target.value); setModel('Other'); }} className="w-full rounded border p-2">
            {makes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          {make === 'Other' ? <input name="manualMake" className="mt-2 w-full rounded border p-2" placeholder="Enter make" required /> : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)} className="w-full rounded border p-2">
            {models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          {model === 'Other' ? <input name="manualModel" className="mt-2 w-full rounded border p-2" placeholder="Enter model" required /> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label htmlFor="year" className="mb-1 block text-sm font-medium">Year</label>
          <input id="year" name="year" type="number" min={1900} max={new Date().getFullYear() + 1} className="w-full rounded border p-2" />
        </div>
        <div>
          <label htmlFor="vin" className="mb-1 block text-sm font-medium">VIN (optional)</label>
          <input id="vin" name="vin" className="w-full rounded border p-2 uppercase" maxLength={17} pattern="[A-HJ-NPR-Za-hj-npr-z0-9]{17}" />
        </div>
        <div>
          <label htmlFor="currentMileage" className="mb-1 block text-sm font-medium">Current mileage (km)</label>
          <input id="currentMileage" name="currentMileage" type="number" min={0} className="w-full rounded border p-2" />
        </div>
      </div>

      <textarea name="notes" className="w-full rounded border p-2" rows={3} placeholder="Notes" />

      <button type="submit" disabled={isSubmitting} className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">
        {isSubmitting ? 'Adding vehicle...' : 'Add vehicle'}
      </button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
