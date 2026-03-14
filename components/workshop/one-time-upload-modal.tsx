'use client';

import { useActionState, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

type OneTimeUploadActionState = {
  status: 'idle' | 'error';
  message?: string;
};

export function OneTimeUploadModal({
  action
}: {
  action: (prevState: OneTimeUploadActionState, formData: FormData) => Promise<OneTimeUploadActionState>;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, { status: 'idle' } as OneTimeUploadActionState);

  return (
    <>
      <Button onClick={() => setOpen(true)}>One-time customer upload</Button>
      <Modal open={open} onClose={() => setOpen(false)} title="One-time customer document upload" maxWidthClass="max-w-4xl">
        <p className="mb-3 text-sm text-gray-600">
          Enter one-time customer and vehicle details, then continue into the standard document upload flow.
        </p>
        <form action={formAction} className="grid gap-3 md:grid-cols-3">
          <input name="customerName" required placeholder="Customer name" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="notificationEmail" type="email" placeholder="Email for document notifications" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <select name="uploadType" className="rounded-xl border border-black/15 px-3 py-2 text-sm">
            <option value="quote">Quote</option>
            <option value="invoice">Invoice</option>
            <option value="inspection_report">Inspection report</option>
          </select>
          <input name="registrationNumber" placeholder="Vehicle reg (optional)" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="make" placeholder="Make" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="model" placeholder="Model" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="vin" placeholder="VIN (optional)" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="billingName" placeholder="Billing name" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="billingCompany" placeholder="Billing company" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="billingEmail" type="email" placeholder="Billing email" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="billingPhone" placeholder="Billing phone" className="rounded-xl border border-black/15 px-3 py-2 text-sm" />
          <input name="billingAddress" placeholder="Billing address" className="rounded-xl border border-black/15 px-3 py-2 text-sm md:col-span-2" />
          <Button type="submit" disabled={pending} className="md:col-span-3">{pending ? 'Opening…' : 'Create and open upload'}</Button>
          {state.status === 'error' ? <p className="text-sm text-red-700 md:col-span-3">{state.message ?? 'Could not create upload case.'}</p> : null}
        </form>
      </Modal>
    </>
  );
}
