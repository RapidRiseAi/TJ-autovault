'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast-provider';
import { removeWorkshopCustomerAccount } from '@/lib/actions/workshop';

export function RemoveCustomerAccountButton({
  customerAccountId,
  customerName
}: {
  customerAccountId: string;
  customerName: string;
}) {
  const router = useRouter();
  const { pushToast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  async function handleRemove() {
    const confirmed = window.confirm(
      `Remove ${customerName} from this workshop? This action cannot be undone.`
    );
    if (!confirmed) return;

    setIsLoading(true);
    const result = await removeWorkshopCustomerAccount({ customerAccountId });
    setIsLoading(false);

    if (!result.ok) {
      pushToast({
        title: 'Could not remove customer',
        description: result.error,
        tone: 'error'
      });
      return;
    }

    pushToast({ title: 'Customer removed', tone: 'success' });
    router.push('/workshop/customers');
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
      {isLoading ? 'Removing…' : 'Remove customer'}
    </Button>
  );
}
