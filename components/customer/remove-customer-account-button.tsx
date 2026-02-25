'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';
import { removeMyCustomerAccount } from '@/lib/actions/workshop';

export function RemoveCustomerAccountButton() {
  const router = useRouter();
  const { pushToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  async function handleRemove() {
    const confirmed = window.confirm(
      'Remove your customer account from this workshop? This action cannot be undone.'
    );
    if (!confirmed) return;

    setIsLoading(true);
    const result = await removeMyCustomerAccount();
    setIsLoading(false);

    if (!result.ok) {
      pushToast({
        title: 'Could not remove account',
        description: result.error,
        tone: 'error'
      });
      return;
    }

    pushToast({ title: 'Account removed', tone: 'success' });
    router.push('/customer/dashboard');
    router.refresh();
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      disabled={isLoading}
      onClick={() => void handleRemove()}
    >
      {isLoading ? 'Removing…' : 'Remove my customer account'}
    </Button>
  );
}
