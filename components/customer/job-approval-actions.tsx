'use client';

import { useState } from 'react';
import { decideJobCardApproval } from '@/lib/actions/customer-vehicles';
import { Button } from '@/components/ui/button';

export function JobApprovalActions({
  approvalId,
  status
}: {
  approvalId: string;
  status: string;
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState('');
  const finalized = ['approved', 'declined'].includes((status ?? '').toLowerCase());

  async function onDecision(decision: 'approved' | 'declined') {
    setIsLoading(true);
    const result = await decideJobCardApproval({ approvalId, decision });
    setIsLoading(false);
    setMessage(result.ok ? `Approval ${decision}.` : result.error);
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" disabled={isLoading || finalized} onClick={() => void onDecision('approved')}>
          Approve
        </Button>
        <Button size="sm" variant="outline" disabled={isLoading || finalized} onClick={() => void onDecision('declined')}>
          Decline
        </Button>
      </div>
      {message ? <p className="text-xs text-gray-600">{message}</p> : null}
    </div>
  );
}
