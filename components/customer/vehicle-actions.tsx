'use client';

import { FormEvent, useState } from 'react';
import { createWorkRequest, decideQuote, updateMileage } from '@/lib/actions/customer-vehicles';

export function RequestForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const result = await createWorkRequest({
      vehicleId,
      requestType: (f.get('requestType') as 'inspection' | 'service') ?? 'inspection',
      preferredDate: f.get('preferredDate')?.toString(),
      notes: f.get('notes')?.toString()
    });
    setMsg(result.ok ? 'Request sent.' : result.error);
  }
  return <form className="space-y-2" onSubmit={onSubmit}><h3 className="font-semibold">Create request</h3><select name="requestType" className="w-full rounded border p-2"><option value="inspection">Inspection</option><option value="service">Service</option></select><input type="date" name="preferredDate" className="w-full rounded border p-2" /><textarea name="notes" className="w-full rounded border p-2" /><button className="rounded bg-brand-red px-3 py-2 text-white">Submit request</button>{msg ? <p className="text-xs">{msg}</p> : null}</form>;
}

export function MileageForm({ vehicleId }: { vehicleId: string }) {
  const [msg, setMsg] = useState('');
  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const km = Number(new FormData(e.currentTarget).get('odometerKm') || 0);
    const result = await updateMileage({ vehicleId, odometerKm: km });
    setMsg(result.ok ? 'Mileage updated.' : result.error);
  }
  return <form className="space-y-2" onSubmit={onSubmit}><h3 className="font-semibold">Update mileage</h3><input name="odometerKm" type="number" min={0} required className="w-full rounded border p-2" /><button className="rounded bg-brand-red px-3 py-2 text-white">Update</button>{msg ? <p className="text-xs">{msg}</p> : null}</form>;
}

export function QuoteDecisionButtons({ quoteId }: { quoteId: string }) {
  const [msg, setMsg] = useState('');
  return <div className="flex gap-2 text-xs"><button onClick={async () => { const r = await decideQuote({ quoteId, decision: 'approved' }); setMsg(r.ok ? 'Approved' : r.error); }} className="rounded border px-2 py-1">Approve</button><button onClick={async () => { const r = await decideQuote({ quoteId, decision: 'declined' }); setMsg(r.ok ? 'Declined' : r.error); }} className="rounded border px-2 py-1">Decline</button>{msg ? <span>{msg}</span> : null}</div>;
}
