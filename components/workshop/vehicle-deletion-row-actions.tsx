'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function VehicleDeletionRowActions({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    const confirmed = window.confirm('Permanently delete this vehicle and all related data/storage? This cannot be undone.');
    if (!confirmed) return;

    setIsDeleting(true);
    setError(null);

    const response = await fetch(`/api/workshop/vehicle-deletions/${requestId}`, { method: 'DELETE' });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      setError(payload?.error ?? 'Delete failed');
      setIsDeleting(false);
      return;
    }

    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a
        href={`/api/workshop/vehicle-deletions/${requestId}/export`}
        className="rounded border px-2 py-1 text-xs hover:bg-gray-50"
      >
        Export ZIP
      </a>
      <button
        type="button"
        onClick={handleDelete}
        disabled={isDeleting}
        className="rounded border border-red-600 px-2 py-1 text-xs text-red-700 disabled:opacity-50"
      >
        {isDeleting ? 'Deleting...' : 'Permanent delete'}
      </button>
      {error ? (
        <div role="alert" className="w-full rounded border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-700">
          {error}
        </div>
      ) : null}
    </div>
  );
}
