'use client';

import { useEffect } from 'react';
import { Card } from '@/components/ui/card';

export default function VehicleDetailError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Vehicle detail route error', error);
  }, [error]);

  return (
    <main>
      <Card>
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-gray-600">We could not render this vehicle page. Please try again.</p>
        <button type="button" onClick={reset} className="mt-4 rounded bg-black px-3 py-2 text-sm text-white">
          Retry
        </button>
      </Card>
    </main>
  );
}
