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
      className="w-full active:scale-[0.98]"
      disabled={pending}
    >
      {pending ? pendingLabel : idleLabel}
    </Button>
  );
}
