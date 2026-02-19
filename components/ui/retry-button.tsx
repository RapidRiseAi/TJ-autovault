'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';

export function RetryButton({ label = 'Retry' }: { label?: string }) {
  const router = useRouter();
  return (
    <Button size="sm" variant="secondary" onClick={() => router.refresh()}>
      {label}
    </Button>
  );
}
