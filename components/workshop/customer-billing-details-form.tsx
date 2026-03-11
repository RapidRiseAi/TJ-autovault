'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export type CustomerBillingActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

type Props = {
  defaults: {
    billingName: string;
    billingCompany: string;
    billingAddress: string;
    billingEmail: string;
    billingPhone: string;
    billingTaxNumber: string;
  };
  action: (
    state: CustomerBillingActionState,
    formData: FormData
  ) => Promise<CustomerBillingActionState>;
};

const initialState: CustomerBillingActionState = {
  status: 'idle',
  message: ''
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving billing details…' : 'Save billing details'}
    </Button>
  );
}

export function CustomerBillingDetailsForm({ defaults, action }: Props) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-4 md:grid-cols-2">
      <div>
        <label htmlFor="billing_name" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Billing name</label>
        <input id="billing_name" name="billing_name" defaultValue={defaults.billingName} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Company or customer billing name" />
      </div>
      <div>
        <label htmlFor="billing_company" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Billing company</label>
        <input id="billing_company" name="billing_company" defaultValue={defaults.billingCompany} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Business / company name" />
      </div>
      <div>
        <label htmlFor="billing_email" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Billing email</label>
        <input id="billing_email" name="billing_email" type="email" defaultValue={defaults.billingEmail} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="accounts@customer.com" />
      </div>
      <div>
        <label htmlFor="billing_phone" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Billing phone</label>
        <input id="billing_phone" name="billing_phone" defaultValue={defaults.billingPhone} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="+27 ..." />
      </div>
      <div>
        <label htmlFor="billing_tax_number" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Billing tax / VAT number</label>
        <input id="billing_tax_number" name="billing_tax_number" defaultValue={defaults.billingTaxNumber} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
      </div>
      <div className="md:col-span-2">
        <label htmlFor="billing_address" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">Billing address</label>
        <textarea id="billing_address" name="billing_address" defaultValue={defaults.billingAddress} rows={4} className="min-h-24 w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Street, suburb, city, postal code" />
      </div>

      <div className="md:col-span-2 space-y-2">
        <SubmitButton />
        {state.status === 'success' ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{state.message}</p>
        ) : null}
        {state.status === 'error' ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{state.message}</p>
        ) : null}
      </div>
    </form>
  );
}
