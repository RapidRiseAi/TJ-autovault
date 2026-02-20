'use client';

import { useState, useTransition } from 'react';
import { MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { createMessage } from '@/lib/actions/messages';

type VehicleOption = { id: string; registration_number: string | null };
type CustomerOption = { id: string; name: string };

export function SendMessageModal({
  vehicles,
  customers,
  defaultVehicleId,
  defaultCustomerId,
  triggerClassName
}: {
  vehicles: VehicleOption[];
  customers?: CustomerOption[];
  defaultVehicleId?: string | null;
  defaultCustomerId?: string | null;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [vehicleId, setVehicleId] = useState<string>(defaultVehicleId ?? 'none');
  const [customerId, setCustomerId] = useState<string>(defaultCustomerId ?? '');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const isWorkshop = Array.isArray(customers);

  return (
    <>
      <Button onClick={() => setOpen(true)} className={triggerClassName}>
        <MessageSquare className="mr-1 h-4 w-4" /> Send message
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title="Send message">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            startTransition(async () => {
              const result = await createMessage({
                customerAccountId: isWorkshop ? customerId : undefined,
                vehicleId: vehicleId === 'none' ? null : vehicleId,
                subject,
                body
              });

              if (!result.ok) {
                setError(result.error);
                return;
              }

              setSubject('');
              setBody('');
              setError(null);
              setOpen(false);
            });
          }}
        >
          {isWorkshop ? (
            <div className="space-y-1">
              <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Customer</label>
              <select className="w-full rounded-lg border px-3 py-2 text-black" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
                <option value="">Select customer</option>
                {(customers ?? []).map((customer) => (
                  <option key={customer.id} value={customer.id}>{customer.name}</option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Vehicle</label>
            <select className="w-full rounded-lg border px-3 py-2 text-black" value={vehicleId} onChange={(event) => setVehicleId(event.target.value)}>
              <option value="none">Not about a vehicle</option>
              {vehicles.map((vehicle) => (
                <option key={vehicle.id} value={vehicle.id}>{vehicle.registration_number ?? vehicle.id}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Subject</label>
            <input className="w-full rounded-lg border px-3 py-2 text-black" value={subject} onChange={(event) => setSubject(event.target.value)} required />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-gray-600">Body</label>
            <textarea className="min-h-28 w-full rounded-lg border px-3 py-2 text-black" value={body} onChange={(event) => setBody(event.target.value)} required />
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={isPending}>Cancel</Button>
            <Button type="submit" disabled={isPending}>{isPending ? 'Sending...' : 'Send message'}</Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
