'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { createWorkshopCustomerVehicle, updateWorkshopVehicleInfo } from '@/lib/actions/workshop';
import { VerifyVehicleButton } from '@/components/workshop/verify-vehicle-button';

type Vehicle = {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometer_km: number | null;
  status: string | null;
  notes: string | null;
  primary_image_path: string | null;
};

const INITIAL_FORM = {
  registrationNumber: '',
  make: '',
  model: '',
  year: '',
  vin: '',
  currentMileage: '',
  notes: ''
};

export function CustomerVehicleManager({ customerAccountId, vehicles }: { customerAccountId: string; vehicles: Vehicle[] }) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formValues, setFormValues] = useState(INITIAL_FORM);

  function setFromVehicle(vehicle: Vehicle) {
    setFormValues({
      registrationNumber: vehicle.registration_number,
      make: vehicle.make ?? '',
      model: vehicle.model ?? '',
      year: vehicle.year ? String(vehicle.year) : '',
      vin: vehicle.vin ?? '',
      currentMileage: vehicle.odometer_km != null ? String(vehicle.odometer_km) : '',
      notes: vehicle.notes ?? ''
    });
  }

  async function submitCreate() {
    setIsLoading(true);
    const result = await createWorkshopCustomerVehicle({
      customerAccountId,
      registrationNumber: formValues.registrationNumber,
      make: formValues.make,
      model: formValues.model,
      year: formValues.year ? Number(formValues.year) : null,
      vin: formValues.vin,
      currentMileage: formValues.currentMileage ? Number(formValues.currentMileage) : null,
      notes: formValues.notes
    });
    setIsLoading(false);

    if (!result.ok) {
      pushToast({ title: 'Could not add vehicle', description: result.error, tone: 'error' });
      return;
    }

    pushToast({ title: 'Vehicle added', tone: 'success' });
    setAddOpen(false);
    setFormValues(INITIAL_FORM);
    router.refresh();
  }

  async function submitUpdate() {
    if (!editingVehicle) return;

    setIsLoading(true);
    const result = await updateWorkshopVehicleInfo({
      vehicleId: editingVehicle.id,
      registrationNumber: formValues.registrationNumber,
      make: formValues.make,
      model: formValues.model,
      year: formValues.year ? Number(formValues.year) : null,
      vin: formValues.vin,
      currentMileage: formValues.currentMileage ? Number(formValues.currentMileage) : null,
      notes: formValues.notes
    });
    setIsLoading(false);

    if (!result.ok) {
      pushToast({ title: 'Could not update vehicle', description: result.error, tone: 'error' });
      return;
    }

    pushToast({ title: 'Vehicle updated', tone: 'success' });
    setEditingVehicle(null);
    setFormValues(INITIAL_FORM);
    router.refresh();
  }

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Vehicles</h2>
        <Button size="sm" onClick={() => { setFormValues(INITIAL_FORM); setAddOpen(true); }}>Add vehicle</Button>
      </div>

      {!vehicles.length ? <p className="text-sm text-gray-500">No vehicles linked to this customer.</p> : (
        <div className="space-y-2">
          {vehicles.map((vehicle) => {
            const pending = (vehicle.status ?? '').toLowerCase().includes('pending');
            return (
              <div key={vehicle.id} className="flex items-center justify-between rounded-2xl border border-black/10 p-3">
                <div className="flex items-center gap-3">
                  {vehicle.primary_image_path ? <img src={`/api/uploads/download?bucket=vehicle-images&path=${encodeURIComponent(vehicle.primary_image_path)}`} alt={vehicle.registration_number} className="h-12 w-12 rounded-xl object-cover" /> : <div className="h-12 w-12 rounded-xl bg-stone-100" />}
                  <div>
                    <p className="text-sm font-semibold">{vehicle.make || vehicle.model ? `${vehicle.make ?? ''} ${vehicle.model ?? ''}`.trim() : vehicle.registration_number}</p>
                    <p className="text-xs text-gray-500">{vehicle.registration_number}</p>
                    <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase">{pending ? 'pending' : vehicle.status ?? 'active'}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  {pending ? <VerifyVehicleButton vehicleId={vehicle.id} /> : null}
                  <Button size="sm" variant="outline" onClick={() => { setEditingVehicle(vehicle); setFromVehicle(vehicle); }}>Edit</Button>
                  <Button asChild size="sm" variant="outline"><Link href={`/workshop/vehicles/${vehicle.id}`}>Open vehicle</Link></Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add vehicle for customer">
        <VehicleForm values={formValues} setValues={setFormValues} onSubmit={submitCreate} isLoading={isLoading} cta="Add vehicle" />
      </Modal>

      <Modal open={Boolean(editingVehicle)} onClose={() => setEditingVehicle(null)} title="Edit vehicle details">
        <VehicleForm values={formValues} setValues={setFormValues} onSubmit={submitUpdate} isLoading={isLoading} cta="Save changes" />
      </Modal>
    </>
  );
}

function VehicleForm({ values, setValues, onSubmit, isLoading, cta }: { values: typeof INITIAL_FORM; setValues: (value: typeof INITIAL_FORM) => void; onSubmit: () => Promise<void>; isLoading: boolean; cta: string; }) {
  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <input className="w-full rounded border p-2 uppercase" placeholder="Registration" required minLength={4} maxLength={12} value={values.registrationNumber} onChange={(event) => setValues({ ...values, registrationNumber: event.target.value })} />
      <div className="grid grid-cols-2 gap-2">
        <input className="w-full rounded border p-2" placeholder="Make" required value={values.make} onChange={(event) => setValues({ ...values, make: event.target.value })} />
        <input className="w-full rounded border p-2" placeholder="Model" required value={values.model} onChange={(event) => setValues({ ...values, model: event.target.value })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <input className="w-full rounded border p-2" type="number" placeholder="Year" min={1900} max={new Date().getFullYear() + 1} value={values.year} onChange={(event) => setValues({ ...values, year: event.target.value })} />
        <input className="w-full rounded border p-2 uppercase" placeholder="VIN" maxLength={17} value={values.vin} onChange={(event) => setValues({ ...values, vin: event.target.value })} />
        <input className="w-full rounded border p-2" type="number" placeholder="Mileage km" min={0} value={values.currentMileage} onChange={(event) => setValues({ ...values, currentMileage: event.target.value })} />
      </div>
      <textarea className="w-full rounded border p-2" placeholder="Notes" maxLength={500} value={values.notes} onChange={(event) => setValues({ ...values, notes: event.target.value })} />
      <Button disabled={isLoading}>{isLoading ? 'Saving...' : cta}</Button>
    </form>
  );
}
