'use client';

import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { SectionCard } from '@/components/ui/section-card';

function storageKey(id?: string, title?: string) {
  const safe = (id || title || 'panel').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
  return `workshop-panel-open:${safe}`;
}

export function PersistedCollapsiblePanel({
  title,
  action,
  defaultOpen = false,
  children,
  id
}: {
  title: string;
  action?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  id?: string;
}) {
  const key = useMemo(() => storageKey(id, title), [id, title]);
  const [open, setOpen] = useState(defaultOpen);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === '1') setOpen(true);
      if (raw === '0') setOpen(false);
    } catch {
      // ignore storage read issues
    }
    setHydrated(true);
  }, [key]);

  function onToggle(nextOpen: boolean) {
    setOpen(nextOpen);
    try {
      window.localStorage.setItem(key, nextOpen ? '1' : '0');
    } catch {
      // ignore storage write issues
    }
  }

  return (
    <SectionCard id={id}>
      <details
        open={open}
        className="group"
        onToggle={(event) => onToggle((event.currentTarget as HTMLDetailsElement).open)}
      >
        <summary className="mb-4 flex cursor-pointer list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">
          <h2 className="text-lg font-semibold text-brand-black">{title}</h2>
          <div className="flex items-center gap-3">
            {action}
            <span className="text-xs font-medium text-gray-500">{hydrated ? (open ? 'Collapse' : 'Expand') : 'Expand'}</span>
          </div>
        </summary>
        <div>{children}</div>
      </details>
    </SectionCard>
  );
}
