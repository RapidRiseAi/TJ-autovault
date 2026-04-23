'use client';

import { useActionState, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

type UploadActionState = {
  status: 'idle' | 'error';
  message?: string;
};

type CustomerOption = {
  id: string;
  name: string;
  vehicles: Array<{ id: string; label: string }>;
};

export function ManagementUploadModal({
  action,
  customers
}: {
  action: (prevState: UploadActionState, formData: FormData) => Promise<UploadActionState>;
  customers: CustomerOption[];
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'customer' | 'one_time'>('customer');
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id ?? '');
  const [state, formAction, pending] = useActionState(action, { status: 'idle' } as UploadActionState);

  const selectedVehicles = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId)?.vehicles ?? [],
    [customers, selectedCustomerId]
  );

  return (
    <>
      <Button onClick={() => setOpen(true)}>Upload document</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Upload document" maxWidthClass="max-w-4xl">
        <form action={formAction} className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-gray-600">
            Upload for
            <select name="uploadMode" value={mode} onChange={(event) => setMode(event.target.value as 'customer' | 'one_time')} className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm text-black">
              <option value="customer">Existing customer</option>
              <option value="one_time">One-time customer</option>
            </select>
          </label>

          <label className="text-sm text-gray-600">
            Document type
            <select name="uploadType" className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm text-black">
              <option value="quote">Quote</option>
              <option value="invoice">Invoice</option>
              <option value="inspection_report">Inspection report</option>
            </select>
          </label>

          {mode === 'customer' ? (
            <>
              <label className="text-sm text-gray-600">
                Customer
                <select name="customerId" value={selectedCustomerId} onChange={(event) => setSelectedCustomerId(event.target.value)} className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm text-black">
                  {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                </select>
              </label>
              <label className="text-sm text-gray-600">
                Vehicle
                <select name="vehicleId" className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm text-black">
                  {selectedVehicles.map((vehicle) => <option key={vehicle.id} value={vehicle.id}>{vehicle.label}</option>)}
                </select>
              </label>
            </>
          ) : (
            <>
              <input name="customerName" required placeholder="Customer name" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="notificationEmail" type="email" placeholder="Notification email" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="registrationNumber" placeholder="Vehicle reg" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="make" placeholder="Make" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="model" placeholder="Model" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="vin" placeholder="VIN" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="billingName" placeholder="Billing name" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="billingCompany" placeholder="Billing company" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="billingEmail" type="email" placeholder="Billing email" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="billingPhone" placeholder="Billing phone" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
              <input name="billingAddress" placeholder="Billing address" className="rounded-xl border border-black/15 px-3 py-2 text-sm md:col-span-2" />
            </>
          )}

          <Button type="submit" disabled={pending} className="md:col-span-2">{pending ? 'Opening…' : 'Continue to vehicle upload'}</Button>
          {state.status === 'error' ? <p className="text-sm text-red-700 md:col-span-2">{state.message ?? 'Could not open upload flow.'}</p> : null}
        </form>
      </Modal>
    </>
  );
}
