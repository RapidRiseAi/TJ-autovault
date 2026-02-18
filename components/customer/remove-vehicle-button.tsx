'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { requestVehicleDeletion } from '@/lib/actions/customer-vehicles';

export function RemoveVehicleButton({ vehicleId }: { vehicleId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function submitDeletionRequest() {
    setIsSubmitting(true);
    setMessage(null);

    const result = await requestVehicleDeletion({ vehicleId, reason });

    if (!result.ok) {
      setMessage(result.error);
      setIsSubmitting(false);
      return;
    }

    setMessage('Vehicle removed from your profile. Workshop has been notified.');
    setConfirming(false);
    setReason('');
    router.push('/customer/dashboard');
    router.refresh();
  }

  return (
    <div className="space-y-2 rounded border border-red-200 bg-red-50 p-3">
      <p className="text-sm font-semibold text-red-800">Remove this vehicle</p>
      <p className="text-xs text-red-700">This removes the vehicle from your profile immediately. Workshop can export records and permanently delete later.</p>

      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="rounded border border-red-600 px-3 py-1 text-sm text-red-700 hover:bg-red-100"
        >
          Remove vehicle
        </button>
      ) : (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-red-800">
            Optional reason
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              className="mt-1 w-full rounded border border-red-300 p-2 text-sm"
              placeholder="Reason for removing this vehicle"
            />
          </label>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={submitDeletionRequest}
              className="rounded bg-red-700 px-3 py-1 text-sm text-white disabled:opacity-60"
            >
              {isSubmitting ? 'Removing...' : 'Confirm remove'}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setConfirming(false);
                setReason('');
                setMessage(null);
              }}
              className="rounded border border-gray-300 px-3 py-1 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message ? <p className="text-xs text-red-800">{message}</p> : null}
    </div>
  );
}
