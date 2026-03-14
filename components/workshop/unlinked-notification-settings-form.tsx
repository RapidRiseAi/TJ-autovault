'use client';

import { useActionState } from 'react';

type FormState = {
  status: 'idle' | 'success' | 'error';
  message?: string;
};

export function UnlinkedNotificationSettingsForm({
  action,
  defaults
}: {
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: {
    linkedEmail: string;
    sendToEmail: string;
    emailEnabled: boolean;
    notifyQuotes: boolean;
    notifyInvoices: boolean;
    notifyReports: boolean;
    notifySystem: boolean;
  };
}) {
  const [state, formAction, pending] = useActionState(action, { status: 'idle' } as FormState);

  return (
    <form action={formAction} className="mt-4 grid gap-3 md:grid-cols-2">
      <label className="text-sm">Linked email
        <input name="linked_email" type="email" defaultValue={defaults.linkedEmail} className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
      </label>
      <label className="text-sm">Send notifications to
        <input name="send_to_email" type="email" defaultValue={defaults.sendToEmail} className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
      </label>
      <label className="flex items-center gap-2 text-sm"><input name="email_enabled" type="checkbox" defaultChecked={defaults.emailEnabled} /> Enable emails</label>
      <label className="flex items-center gap-2 text-sm"><input name="notify_quotes" type="checkbox" defaultChecked={defaults.notifyQuotes} /> Quotes</label>
      <label className="flex items-center gap-2 text-sm"><input name="notify_invoices" type="checkbox" defaultChecked={defaults.notifyInvoices} /> Invoices</label>
      <label className="flex items-center gap-2 text-sm"><input name="notify_reports" type="checkbox" defaultChecked={defaults.notifyReports} /> Reports</label>
      <label className="flex items-center gap-2 text-sm"><input name="notify_system" type="checkbox" defaultChecked={defaults.notifySystem} /> System updates</label>
      <button type="submit" disabled={pending} className="rounded-xl bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 md:col-span-2">{pending ? 'Saving…' : 'Save notification settings'}</button>
      {state.status === 'success' ? <p className="text-sm text-emerald-700 md:col-span-2">{state.message ?? 'Saved.'}</p> : null}
      {state.status === 'error' ? <p className="text-sm text-red-700 md:col-span-2">{state.message ?? 'Failed to save.'}</p> : null}
    </form>
  );
}
