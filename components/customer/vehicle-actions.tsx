'use client';

import { FormEvent, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  createWorkRequest,
  decideQuote,
  decideRecommendation,
  updateMileage
} from '@/lib/actions/customer-vehicles';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from '@/components/ui/confirm-modal';

export function RequestForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    const formData = new FormData(event.currentTarget);
    const result = await createWorkRequest({
      vehicleId,
      requestType:
        (formData.get('requestType') as 'inspection' | 'service') ??
        'inspection',
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
      <input
        type="date"
        name="preferredDate"
        className="w-full rounded border p-2"
      />
      <textarea name="notes" className="w-full rounded border p-2" />
      <Button disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Submit request
      </Button>
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
      <input
        name="odometerKm"
        type="number"
        min={0}
        required
        className="w-full rounded border p-2"
      />
      <Button disabled={isSubmitting}>
        {isSubmitting ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : null}
        Update
      </Button>
      {msg ? <p className="text-xs">{msg}</p> : null}
    </form>
  );
}

function quoteStatusLabel(status: string | null) {
  return (status ?? 'sent').toUpperCase();
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(iso));
}

export function QuoteDecisionButtons({
  quoteId,
  status,
  amountLabel,
  createdAt,
  quoteRef
}: {
  quoteId: string;
  status: string | null;
  amountLabel: string;
  createdAt: string | null;
  quoteRef: string;
}) {
  const [msg, setMsg] = useState('');
  const [declineReason, setDeclineReason] = useState('');
  const [approveModalOpen, setApproveModalOpen] = useState(false);
  const [declineModalOpen, setDeclineModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const finalized = useMemo(() => {
    const normalized = (status ?? '').toLowerCase();
    return normalized === 'approved' || normalized === 'declined';
  }, [status]);

  async function onConfirm(decision: 'approved' | 'declined') {
    if (finalized) {
      setMsg('This quote is already finalized.');
      return;
    }

    setIsLoading(true);
    const result = await decideQuote({
      quoteId,
      decision,
      reason:
        decision === 'declined' ? declineReason.trim() || undefined : undefined
    });
    setIsLoading(false);

    if (result.ok) {
      setMsg(decision === 'approved' ? 'Approved' : 'Declined');
      setApproveModalOpen(false);
      setDeclineModalOpen(false);
      setDeclineReason('');
      return;
    }

    setMsg(result.error);
  }

  return (
    <>
      <div className="space-y-2 text-xs">
        <div className="flex gap-2">
          <Button
            disabled={finalized}
            size="sm"
            variant="outline"
            onClick={() => setApproveModalOpen(true)}
            className={finalized ? 'cursor-not-allowed opacity-45' : ''}
          >
            Approve
          </Button>
          <Button
            disabled={finalized}
            size="sm"
            variant="outline"
            onClick={() => setDeclineModalOpen(true)}
            className={finalized ? 'cursor-not-allowed opacity-45' : ''}
          >
            Decline
          </Button>
        </div>
        {msg ? <span className="text-gray-600">{msg}</span> : null}
      </div>

      <ConfirmModal
        open={approveModalOpen}
        onClose={() => setApproveModalOpen(false)}
        title="Approve quote"
        description="Confirm this quote decision. This action finalizes the quote status."
        onConfirm={() => void onConfirm('approved')}
        isLoading={isLoading}
        confirmLabel="Confirm approve"
      >
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-xl border border-black/10 bg-zinc-50 p-3 text-sm">
          <dt className="text-gray-500">Reference</dt>
          <dd className="font-medium text-black">{quoteRef}</dd>
          <dt className="text-gray-500">Amount</dt>
          <dd className="font-medium text-black">{amountLabel}</dd>
          <dt className="text-gray-500">Date</dt>
          <dd className="font-medium text-black">{formatDate(createdAt)}</dd>
          <dt className="text-gray-500">Status</dt>
          <dd className="font-medium text-black">{quoteStatusLabel(status)}</dd>
        </dl>
      </ConfirmModal>

      <ConfirmModal
        open={declineModalOpen}
        onClose={() => setDeclineModalOpen(false)}
        title="Decline quote"
        description="You can add an optional reason before confirming your decline."
        onConfirm={() => void onConfirm('declined')}
        isLoading={isLoading}
        confirmLabel="Confirm decline"
        danger
      >
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-black">Reason (optional)</span>
          <textarea
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
            rows={3}
            className="w-full rounded-xl border border-black/15 p-2"
            placeholder="Reason for decline"
          />
        </label>
      </ConfirmModal>
    </>
  );
}

export function RecommendationDecisionButtons({
  recommendationId
}: {
  recommendationId: string;
}) {
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
          const result = await decideRecommendation({
            recommendationId,
            decision: 'approved'
          });
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
          const result = await decideRecommendation({
            recommendationId,
            decision: 'declined'
          });
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
