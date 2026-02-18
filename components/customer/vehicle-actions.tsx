'use client';

import { FormEvent, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { createWorkRequest, decideQuote, decideRecommendation, updateMileage } from '@/lib/actions/customer-vehicles';
import { Button } from '@/components/ui/button';

export function RequestForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const result = await createWorkRequest({
      vehicleId,
      requestType: (formData.get('requestType') as 'inspection' | 'service') ?? 'inspection',
      preferredDate: formData.get('preferredDate')?.toString(),
      notes: formData.get('notes')?.toString()
    });
    setIsSubmitting(false);
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
      <Button disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Submit request</Button>
      {msg ? <p className="text-xs">{msg}</p> : null}
    </form>
  );
}

export function MileageForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const km = Number(new FormData(event.currentTarget).get('odometerKm') || 0);
    const result = await updateMileage({ vehicleId, odometerKm: km });
    setIsSubmitting(false);
    setMsg(result.ok ? 'Mileage updated.' : result.error);
  }

  return (
    <form className="space-y-2" onSubmit={onSubmit}>
      <h3 className="font-semibold">Update mileage</h3>
      <input name="odometerKm" type="number" min={0} required className="w-full rounded border p-2" />
      <Button disabled={isSubmitting}>{isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Update</Button>
      {msg ? <p className="text-xs">{msg}</p> : null}
    </form>
  );
}

export function QuoteDecisionButtons({ quoteId }: { quoteId: string }) {
  const [msg, setMsg] = useState('');
  const [showDeclineReason, setShowDeclineReason] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  async function approveQuote() {
    setIsLoading(true);
    const result = await decideQuote({ quoteId, decision: 'approved' });
    setIsLoading(false);
    setMsg(result.ok ? 'Approved' : result.error);
    if (result.ok) {
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  }

  async function declineQuote() {
    setIsLoading(true);
    const result = await decideQuote({ quoteId, decision: 'declined', reason: declineReason.trim() || undefined });
    setIsLoading(false);
    setMsg(result.ok ? 'Declined' : result.error);
    if (result.ok) {
      setShowDeclineReason(false);
      setDeclineReason('');
    }
  }

  return (
    <div className="space-y-2 text-xs">
      <div className="flex gap-2">
        <Button disabled={isLoading} size="sm" variant="outline" onClick={approveQuote}>{isLoading ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}Approve</Button>
        <Button disabled={isLoading} size="sm" variant="outline" onClick={() => setShowDeclineReason((prev) => !prev)}>Decline</Button>
      </div>
      {showDeclineReason ? (
        <div className="space-y-2">
          <textarea value={declineReason} onChange={(event) => setDeclineReason(event.target.value)} className="w-full rounded border p-2" rows={3} placeholder="Reason for decline (optional)" />
          <Button size="sm" variant="outline" disabled={isLoading} onClick={declineQuote}>Confirm decline</Button>
        </div>
      ) : null}
      {msg ? <span>{msg}</span> : null}
    </div>
  );
}

export function RecommendationDecisionButtons({ recommendationId }: { recommendationId: string }) {
  const [msg, setMsg] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  return (
    <div className="flex gap-2 text-xs">
      <Button
        disabled={isLoading}
        size="sm"
        variant="outline"
        onClick={async () => {
          setIsLoading(true);
          const result = await decideRecommendation({ recommendationId, decision: 'approved' });
          setIsLoading(false);
          setMsg(result.ok ? 'Approved' : result.error);
        }}
      >
        Approve
      </Button>
      <Button
        disabled={isLoading}
        size="sm"
        variant="outline"
        onClick={async () => {
          setIsLoading(true);
          const result = await decideRecommendation({ recommendationId, decision: 'declined' });
          setIsLoading(false);
          setMsg(result.ok ? 'Declined' : result.error);
        }}
      >
        Decline
      </Button>
      {msg ? <span>{msg}</span> : null}
    </div>
  );
}
