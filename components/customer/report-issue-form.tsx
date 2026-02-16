'use client';

import { FormEvent, useState } from 'react';
import { createSupportTicket } from '@/lib/actions/customer-vehicles';

export function ReportIssueForm({ vehicleId }: { vehicleId: string }) {
  const [category, setCategory] = useState<'account'|'vehicle'|'service'|'billing'|'other'>('vehicle');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    const result = await createSupportTicket({ vehicleId, category, message });
    setIsSubmitting(false);
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setMessage('');
    setStatus('Problem reported successfully.');
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <h2 className="text-lg font-semibold">Report a problem</h2>
      <select className="w-full rounded border p-2" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
        <option value="vehicle">Vehicle</option>
        <option value="service">Service</option>
        <option value="billing">Billing</option>
        <option value="account">Account</option>
        <option value="other">Other</option>
      </select>
      <textarea className="w-full rounded border p-2" value={message} onChange={(e) => setMessage(e.target.value)} rows={4} required placeholder="Describe the issue" />
      <button type="submit" disabled={isSubmitting} className="rounded bg-brand-red px-4 py-2 text-white disabled:opacity-50">{isSubmitting ? 'Submitting...' : 'Submit'}</button>
      {status ? <p className="text-sm">{status}</p> : null}
    </form>
  );
}
