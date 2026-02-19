import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function MetricCard({
  label,
  value,
  support,
  visual,
  action,
  className
}: {
  label: string;
  value: ReactNode;
  support?: ReactNode;
  visual?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-3xl border border-black/10 bg-white/95 p-5 shadow-[0_14px_34px_rgba(17,17,17,0.08)]',
        className
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
          <p className="text-3xl font-semibold leading-none text-black sm:text-[2rem]">{value}</p>
          {support ? <p className="text-xs text-gray-500">{support}</p> : null}
        </div>
        {visual ? <div className="shrink-0 self-start">{visual}</div> : null}
      </div>
      {action ? <div className="mt-auto pt-4">{action}</div> : null}
    </div>
  );
}
