'use client';

import { FormEvent, useState } from 'react';
import { LifeBuoy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
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

      <Modal open={open} onClose={() => setOpen(false)} title="Contact support" maxWidthClass="max-w-xl">
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
      </Modal>
    </>
  );
}
