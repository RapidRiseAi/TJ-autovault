'use client';

import { useState } from 'react';
import { updateWorkRequestStatus } from '@/lib/actions/workshop';
import { WORK_REQUEST_STATUSES } from '@/lib/work-request-statuses';

export function WorkRequestStatusForm({ workRequestId, initialStatus }: { workRequestId: string; initialStatus: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('');

  return (
    <form
      className="space-y-2"
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await updateWorkRequestStatus({ workRequestId, status: status as (typeof WORK_REQUEST_STATUSES)[number] });
        setMessage(result.ok ? result.message ?? 'Updated' : result.error);
      }}
    >
      <label className="block text-sm font-medium">Status</label>
      <select value={status} onChange={(event) => setStatus(event.target.value)} className="w-full rounded border p-2">
        {WORK_REQUEST_STATUSES.map((entry) => (
          <option key={entry} value={entry}>{entry.replaceAll('_', ' ')}</option>
        ))}
      </select>
      <button className="rounded bg-black px-3 py-1 text-white">Update status</button>
      {message ? <p className="text-xs">{message}</p> : null}
    </form>
  );
}
