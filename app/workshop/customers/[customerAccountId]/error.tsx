'use client';

import Link from 'next/link';

export default function WorkshopCustomerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-bold">Unable to load customer details</h1>
      <p className="text-sm text-gray-600">
        We could not open this customer page right now. Please try again. If this keeps happening, return to customers and reopen the account.
      </p>
      <p className="text-xs text-gray-500">Error: {error.message || 'Unexpected error'}</p>
      <div className="flex gap-2">
        <button type="button" onClick={reset} className="rounded border border-gray-300 px-3 py-2 text-sm">
          Try again
        </button>
        <Link href="/workshop/customers" className="rounded border border-gray-300 px-3 py-2 text-sm">
          Back to customers
        </Link>
      </div>
    </main>
  );
}
