'use client';

import { useActionState } from 'react';
import { Button } from '@/components/ui/button';
import type { NotificationEmailSettings, NotificationEmailSettingsState } from '@/lib/actions/notification-email-settings';
import { saveNotificationEmailSettings } from '@/lib/actions/notification-email-settings';

const initialState: NotificationEmailSettingsState = { ok: false, message: '' };

function Toggle({ name, label, defaultChecked }: { name: string; label: string; defaultChecked: boolean }) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm">
      <span>{label}</span>
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="h-4 w-4" />
    </label>
  );
}

export function NotificationEmailSettingsForm({ initial }: { initial: NotificationEmailSettings }) {
  const [state, action, pending] = useActionState(saveNotificationEmailSettings, initialState);

  return (
    <form action={action} className="space-y-4 rounded-2xl border border-black/10 bg-white p-4">
      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Delivery</h2>
        <Toggle name="emailEnabled" label="Enable email notifications" defaultChecked={initial.emailEnabled} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Recipient emails (max 2)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <input name="recipientOneEmail" type="email" defaultValue={initial.recipientOneEmail} placeholder="notifications@company.com" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
          <input name="recipientOneLabel" defaultValue={initial.recipientOneLabel} placeholder="Email 1 label (optional)" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
        </div>
        <Toggle name="recipientOneActive" label="Email 1 active" defaultChecked={initial.recipientOneActive} />

        <div className="grid gap-2 sm:grid-cols-2">
          <input name="recipientTwoEmail" type="email" defaultValue={initial.recipientTwoEmail} placeholder="team@company.com" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
          <input name="recipientTwoLabel" defaultValue={initial.recipientTwoLabel} placeholder="Email 2 label (optional)" className="rounded-lg border border-black/15 px-3 py-2 text-sm" />
        </div>
        <Toggle name="recipientTwoActive" label="Email 2 active" defaultChecked={initial.recipientTwoActive} />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold">Events</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle name="notifyMessages" label="Messages" defaultChecked={initial.notifyMessages} />
          <Toggle name="notifyQuotes" label="Quotes" defaultChecked={initial.notifyQuotes} />
          <Toggle name="notifyInvoices" label="Invoices" defaultChecked={initial.notifyInvoices} />
          <Toggle name="notifyRequests" label="Requests" defaultChecked={initial.notifyRequests} />
          <Toggle name="notifyReports" label="Reports / uploads" defaultChecked={initial.notifyReports} />
          <Toggle name="notifyRecommendations" label="Recommendations" defaultChecked={initial.notifyRecommendations} />
          <Toggle name="notifyJobUpdates" label="Job updates" defaultChecked={initial.notifyJobUpdates} />
          <Toggle name="notifyPayouts" label="Payouts" defaultChecked={initial.notifyPayouts} />
          <Toggle name="notifySystem" label="System notifications" defaultChecked={initial.notifySystem} />
        </div>
      </div>

      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-green-700' : 'text-red-700'}`}>{state.message}</p>
      ) : null}

      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button>
    </form>
  );
}
