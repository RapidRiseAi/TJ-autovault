'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createCustomerVehicle } from '@/lib/actions/customer-vehicles';
import { VEHICLE_MAKES, VEHICLE_MODELS_BY_MAKE } from '@/lib/vehicle-makes-models';

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/;
const REGISTRATION_REGEX = /^[A-Z0-9\- ]{4,12}$/;

export function AddVehicleForm() {
  const router = useRouter();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [makeFilter, setMakeFilter] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const filteredMakes = useMemo(
    () => VEHICLE_MAKES.filter((entry) => entry.toLowerCase().includes(makeFilter.toLowerCase())),
    [makeFilter]
  );

  const models = useMemo(() => (make ? VEHICLE_MODELS_BY_MAKE[make] ?? ['Other'] : []), [make]);

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

    if (!make) errors.make = 'Please select a make.';
    if (make && make !== 'Other' && !model) errors.model = 'Please select a model.';

    if (make === 'Other' && !(formData.get('manualMake')?.toString() ?? '').trim()) {
      errors.manualMake = 'Please enter a custom make.';
    }

    if ((model === 'Other' || make === 'Other') && !(formData.get('manualModel')?.toString() ?? '').trim()) {
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

    const result = await createCustomerVehicle({
      registrationNumber: formData.get('registrationNumber')?.toString() ?? '',
      make: make === 'Other' ? formData.get('manualMake')?.toString() ?? '' : make,
      model: model === 'Other' || make === 'Other' ? formData.get('manualModel')?.toString() ?? '' : model,
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
        <input id="registrationNumber" name="registrationNumber" className="w-full rounded border p-2 uppercase" required minLength={4} maxLength={12} />
        {fieldErrors.registrationNumber ? <p className="text-sm text-red-700">{fieldErrors.registrationNumber}</p> : null}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium">Search make</label>
          <input className="mb-2 w-full rounded border p-2" placeholder="Type to filter makes" value={makeFilter} onChange={(e) => setMakeFilter(e.target.value)} />
          <label className="mb-1 block text-sm font-medium">Make</label>
          <select className="w-full rounded border p-2" value={make} onChange={(e) => { setMake(e.target.value); setModel(''); }}>
            <option value="">Select make</option>
            {filteredMakes.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          {fieldErrors.make ? <p className="text-sm text-red-700">{fieldErrors.make}</p> : null}
          {make === 'Other' ? <input name="manualMake" className="mt-2 w-full rounded border p-2" placeholder="Enter make" required /> : null}
          {fieldErrors.manualMake ? <p className="text-sm text-red-700">{fieldErrors.manualMake}</p> : null}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">Model</label>
          <select className="w-full rounded border p-2" value={model} disabled={!make} onChange={(e) => setModel(e.target.value)}>
            <option value="">{make ? 'Select model' : 'Select make first'}</option>
            {models.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </select>
          {fieldErrors.model ? <p className="text-sm text-red-700">{fieldErrors.model}</p> : null}
          {model === 'Other' || make === 'Other' ? <input name="manualModel" className="mt-2 w-full rounded border p-2" placeholder="Enter model" required /> : null}
          {fieldErrors.manualModel ? <p className="text-sm text-red-700">{fieldErrors.manualModel}</p> : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div><label htmlFor="year" className="mb-1 block text-sm font-medium">Year</label><input id="year" name="year" type="number" min={1900} max={new Date().getFullYear() + 1} className="w-full rounded border p-2" />{fieldErrors.year ? <p className="text-sm text-red-700">{fieldErrors.year}</p> : null}</div>
        <div><label htmlFor="vin" className="mb-1 block text-sm font-medium">VIN (optional)</label><input id="vin" name="vin" className="w-full rounded border p-2 uppercase" maxLength={17} />{fieldErrors.vin ? <p className="text-sm text-red-700">{fieldErrors.vin}</p> : null}</div>
        <div><label htmlFor="currentMileage" className="mb-1 block text-sm font-medium">Current mileage (km)</label><input id="currentMileage" name="currentMileage" type="number" min={0} className="w-full rounded border p-2" />{fieldErrors.currentMileage ? <p className="text-sm text-red-700">{fieldErrors.currentMileage}</p> : null}</div>
      </div>

      <textarea name="notes" className="w-full rounded border p-2" rows={3} placeholder="Notes" />
      <button type="submit" disabled={isSubmitting} className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">{isSubmitting ? 'Adding vehicle...' : 'Add vehicle'}</button>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}
