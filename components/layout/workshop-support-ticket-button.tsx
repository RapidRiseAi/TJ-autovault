'use client';

import { FormEvent, useState } from 'react';
import { LifeBuoy, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';

export function WorkshopSupportTicketButton() {
  const [open, setOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const { pushToast } = useToast();

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const trimmed = message.trim();
    if (!trimmed) {
      pushToast({ title: 'Please describe your issue.', tone: 'error' });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetch('/api/workshop/support-tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed })
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || !result.ok) {
        pushToast({
          title: 'Could not submit support ticket',
          description: result.error ?? 'Please try again.',
          tone: 'error'
        });
        return;
      }

      pushToast({
        title: 'Support ticket submitted',
        description: 'Our team has received your report and will follow up.',
        tone: 'success'
      });
      setMessage('');
      setOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-black/15 px-3.5 shadow-sm transition hover:-translate-y-px hover:shadow-md"
        aria-label="Open support"
      >
        <LifeBuoy className="h-4 w-4" />
        <span className="hidden sm:inline">Support</span>
      </Button>

      {open ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4 backdrop-blur-[1px]"
          role="dialog"
          aria-modal="true"
          aria-label="Contact support"
        >
          <button
            type="button"
            className="absolute inset-0"
            onClick={() => setOpen(false)}
            aria-label="Close support popup"
          />

          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-black/10 bg-white p-5 shadow-[0_30px_90px_rgba(0,0,0,0.32)] sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-black">Contact support</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-full border border-black/15 p-2 text-gray-700 transition hover:bg-gray-100"
                aria-label="Close support popup"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={onSubmit} className="space-y-3">
              <p className="text-sm text-gray-600">
                Describe the issue you are facing and we will send it to our support team.
              </p>
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                required
                className="min-h-36 w-full rounded-2xl border border-black/15 bg-white px-4 py-3 text-sm"
                placeholder="What happened, where it happened, and what you expected."
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1 rounded-xl"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting} className="flex-1 rounded-xl">
                  {isSubmitting ? 'Submitting...' : 'Submit report ticket'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
