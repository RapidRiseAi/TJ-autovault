'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';

export type WorkshopProfileActionState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

type WorkshopProfileFormProps = {
  action: (
    state: WorkshopProfileActionState,
    formData: FormData
  ) => Promise<WorkshopProfileActionState>;
  children: React.ReactNode;
};

const initialState: WorkshopProfileActionState = {
  status: 'idle',
  message: ''
};

function WorkshopProfileSubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving profile…' : 'Save profile'}
    </Button>
  );
}

export function WorkshopProfileForm({ action, children }: WorkshopProfileFormProps) {
  const [state, formAction] = useActionState(action, initialState);

  return (
    <form action={formAction} className="grid gap-5 md:grid-cols-2">
      {children}
      <div className="md:col-span-2 space-y-2">
        <WorkshopProfileSubmitButton />
        {state.status === 'success' ? (
          <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            {state.message}
          </p>
        ) : null}
        {state.status === 'error' ? (
          <p className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}
