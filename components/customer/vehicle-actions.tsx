'use client';

import { FormEvent, useState } from 'react';
import { createWorkRequest, decideQuote, decideRecommendation, updateMileage } from '@/lib/actions/customer-vehicles';

export function RequestForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const result = await createWorkRequest({
      vehicleId,
      requestType: (formData.get('requestType') as 'inspection' | 'service') ?? 'inspection',
      preferredDate: formData.get('preferredDate')?.toString(),
      notes: formData.get('notes')?.toString()
    });
    setMsg(result.ok ? 'Request sent.' : result.error);
  }

  return (
    <form className="space-y-2" onSubmit={onSubmit}>
      <h3 className="font-semibold">Create request</h3>
      <select name="requestType" className="w-full rounded border p-2">
        <option value="inspection">Inspection</option>
        <option value="service">Service</option>
      </select>
      <input type="date" name="preferredDate" className="w-full rounded border p-2" />
      <textarea name="notes" className="w-full rounded border p-2" />
      <button className="rounded bg-brand-red px-3 py-2 text-white">Submit request</button>
      {msg ? <p className="text-xs">{msg}</p> : null}
    </form>
  );
}

export function MileageForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const km = Number(new FormData(event.currentTarget).get('odometerKm') || 0);
    const result = await updateMileage({ vehicleId, odometerKm: km });
    setMsg(result.ok ? 'Mileage updated.' : result.error);
  }

  return (
    <form className="space-y-2" onSubmit={onSubmit}>
      <h3 className="font-semibold">Update mileage</h3>
      <input name="odometerKm" type="number" min={0} required className="w-full rounded border p-2" />
      <button className="rounded bg-brand-red px-3 py-2 text-white">Update</button>
      {msg ? <p className="text-xs">{msg}</p> : null}
    </form>
  );
}

export function QuoteDecisionButtons({ quoteId }: { quoteId: string }) {
  const [msg, setMsg] = useState('');
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');

  async function approveQuote() {
    const result = await decideQuote({ quoteId, decision: 'approved' });
    setMsg(result.ok ? 'Approved' : result.error);
    if (result.ok) {
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  }

  async function declineQuote() {
    const result = await decideQuote({ quoteId, decision: 'declined', reason: declineReason.trim() || undefined });
    setMsg(result.ok ? 'Declined' : result.error);
    if (result.ok) {
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        <button onClick={approveQuote} className="rounded border px-2 py-1">Approve</button>
        <button onClick={() => setShowDeclineReason((prev) => !prev)} className="rounded border px-2 py-1">Decline</button>
      </div>
      {showDeclineReason ? (
        <div className="space-y-2">
          <textarea
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
            className="w-full rounded border p-2"
            rows={3}
            placeholder="Reason for decline (optional)"
          />
          <button onClick={declineQuote} className="rounded border px-2 py-1">Confirm decline</button>
        </div>
      ) : null}
      {msg ? <span>{msg}</span> : null}
    </div>
  );
}

export function RecommendationDecisionButtons({ recommendationId }: { recommendationId: string }) {
  const [msg, setMsg] = useState('');

  return (
    <div className="flex gap-2 text-xs">
      <button
        onClick={async () => {
          const result = await decideRecommendation({ recommendationId, decision: 'approved' });
          setMsg(result.ok ? 'Approved' : result.error);
        }}
        className="rounded border px-2 py-1"
      >
        Approve
      </button>
      <button
        onClick={async () => {
          const result = await decideRecommendation({ recommendationId, decision: 'declined' });
          setMsg(result.ok ? 'Declined' : result.error);
        }}
        className="rounded border px-2 py-1"
      >
        Decline
      </button>
      {msg ? <span>{msg}</span> : null}
    </div>
  );
}
