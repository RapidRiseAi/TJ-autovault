'use client';

import { useEffect } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export function FormSubmitButton({
  idleLabel,
  pendingLabel,
  transitionMessage
}: {
  idleLabel: string;
  pendingLabel: string;
  transitionMessage?: string;
}) {
  const { pending } = useFormStatus();

  useEffect(() => {
    if (pending) {
      window.dispatchEvent(
        new CustomEvent('auth-transition:start', {
          detail: { message: transitionMessage ?? pendingLabel }
        })
      );
      return;
    }
    window.dispatchEvent(new Event('auth-transition:end'));
  }, [pending, pendingLabel, transitionMessage]);

  return (
    <Button
      type="submit"
      className="h-11 w-full bg-gradient-to-b from-red-600 to-red-700 shadow-[0_12px_30px_rgba(220,38,38,0.35)] transition-all hover:from-red-500 hover:to-red-600 active:scale-[0.98]"
      disabled={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
