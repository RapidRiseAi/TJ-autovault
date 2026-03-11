'use client';

import { useActionState, useMemo, useState } from 'react';
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

const EVENT_FIELDS = [
  { key: 'notifyMessages', label: 'Messages' },
  { key: 'notifyQuotes', label: 'Quotes' },
  { key: 'notifyInvoices', label: 'Invoices' },
  { key: 'notifyRequests', label: 'Requests' },
  { key: 'notifyReports', label: 'Reports / uploads' },
  { key: 'notifyRecommendations', label: 'Recommendations' },
  { key: 'notifyJobUpdates', label: 'Job updates' },
  { key: 'notifyPayouts', label: 'Payouts' },
  { key: 'notifySystem', label: 'System notifications' }
] as const;

const BASIC_PLAN_RECOMMENDED = new Set([
  'notifyMessages',
  'notifyQuotes',
  'notifyInvoices'
]);

export function NotificationEmailSettingsForm({ initial }: { initial: NotificationEmailSettings }) {
  const [state, action, pending] = useActionState(saveNotificationEmailSettings, initialState);
  const [eventSelections, setEventSelections] = useState<Record<string, boolean>>({
    notifyMessages: initial.notifyMessages,
    notifyQuotes: initial.notifyQuotes,
    notifyInvoices: initial.notifyInvoices,
    notifyRequests: initial.notifyRequests,
    notifyReports: initial.notifyReports,
    notifyRecommendations: initial.notifyRecommendations,
    notifySystem: initial.notifySystem,
    notifyJobUpdates: initial.notifyJobUpdates,
    notifyPayouts: initial.notifyPayouts
  });
  const [selectionWarning, setSelectionWarning] = useState('');

  const selectedCount = useMemo(
    () => Object.values(eventSelections).filter(Boolean).length,
    [eventSelections]
  );
  const selectionLimit = initial.notificationSelectionLimit;
  const limitReached = selectionLimit !== null && selectedCount >= selectionLimit;

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
        {initial.planCode === '1' ? (
          <p className="text-xs text-amber-700">
            Plan 1 allows 3 notification types. Recommended: Messages, Quotes, and Invoices.
          </p>
        ) : null}
        {selectionLimit !== null ? (
          <p className="text-xs text-zinc-600">
            Selected {selectedCount} of {selectionLimit} allowed types.
          </p>
        ) : null}
        <div className="grid gap-2 sm:grid-cols-2">
          {EVENT_FIELDS.map((field) => {
            const checked = eventSelections[field.key];
            const disabled = Boolean(selectionLimit !== null && !checked && limitReached);
            return (
              <label key={field.key} className="flex items-center justify-between gap-3 rounded-lg border border-black/10 px-3 py-2 text-sm">
                <span>{field.label}</span>
                {initial.planCode === '1' && BASIC_PLAN_RECOMMENDED.has(field.key) ? (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800">
                    Recommended
                  </span>
                ) : null}
                <input
                  name={field.key}
                  type="checkbox"
                  checked={checked}
                  disabled={disabled}
                  className="h-4 w-4"
                  onChange={(event) => {
                    const nextChecked = event.target.checked;
                    if (selectionLimit !== null && nextChecked && !checked && selectedCount >= selectionLimit) {
                      setSelectionWarning(`This plan allows only ${selectionLimit} notification types.`);
                      return;
                    }
                    setSelectionWarning('');
                    setEventSelections((prev) => ({ ...prev, [field.key]: nextChecked }));
                  }}
                />
              </label>
            );
          })}
        </div>
        {selectionWarning ? <p className="text-xs text-red-700">{selectionWarning}</p> : null}
      </div>

      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-green-700' : 'text-red-700'}`}>{state.message}</p>
      ) : null}

      <Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save settings'}</Button>
    </form>
  );
}
