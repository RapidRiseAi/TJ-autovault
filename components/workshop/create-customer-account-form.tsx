'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast-provider';
import { createWorkshopCustomerAccount } from '@/lib/actions/workshop';

const INITIAL = {
  name: '',
  linkedEmail: '',
  onboardingStatus: 'prospect_unpaid' as
    | 'prospect_unpaid'
    | 'registered_unpaid'
    | 'active_paid'
};

export function CreateCustomerAccountForm() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [values, setValues] = useState(INITIAL);

  async function handleSubmit() {
    setPending(true);
    const result = await createWorkshopCustomerAccount(values);
    setPending(false);

    if (!result.ok) {
      pushToast({
        title: 'Could not create customer',
        description: result.error,
        tone: 'error'
      });
      return;
    }

    pushToast({ title: 'Customer created', tone: 'success' });
    setValues(INITIAL);
    setOpen(false);
    router.refresh();
    if (result.customerAccountId) {
      router.push(`/workshop/customers/${result.customerAccountId}`);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>Add customer</Button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Create workshop customer"
      >
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSubmit();
          }}
        >
          <div>
            <label className="mb-1 block text-sm font-medium">Customer name</label>
            <input
              required
              minLength={2}
              maxLength={120}
              className="w-full rounded border p-2"
              value={values.name}
              onChange={(event) =>
                setValues((previous) => ({ ...previous, name: event.target.value }))
              }
              placeholder="John Doe"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Linked email (optional)
            </label>
            <input
              type="email"
              className="w-full rounded border p-2"
              value={values.linkedEmail}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  linkedEmail: event.target.value
                }))
              }
              placeholder="customer@email.com"
            />
            <p className="mt-1 text-xs text-gray-500">
              No verification is sent now. The account links automatically when
              this email signs up.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Status</label>
            <select
              className="w-full rounded border p-2"
              value={values.onboardingStatus}
              onChange={(event) =>
                setValues((previous) => ({
                  ...previous,
                  onboardingStatus: event.target.value as
                    | 'prospect_unpaid'
                    | 'registered_unpaid'
                    | 'active_paid'
                }))
              }
            >
              <option value="prospect_unpaid">Unpaid (no dashboard yet)</option>
              <option value="registered_unpaid">Registered unpaid</option>
              <option value="active_paid">Paid / active</option>
            </select>
          </div>

          <Button type="submit" disabled={pending} className="w-full">
            {pending ? 'Creating…' : 'Create customer'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
