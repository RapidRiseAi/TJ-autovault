import type { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ActionTile({
  title,
  description,
  icon,
  onClick,
  disabled,
  primary = false
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border bg-white p-4 text-left shadow-[0_6px_14px_rgba(17,17,17,0.05)] transition duration-150 hover:-translate-y-px hover:border-neutral-300 hover:shadow-[0_10px_22px_rgba(17,17,17,0.08)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        primary
          ? 'border-brand-red/30 bg-gradient-to-r from-red-50/80 to-white'
          : 'border-neutral-200'
      )}
    >
      {primary ? <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-red/65" aria-hidden /> : null}
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-black">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-gray-400 transition group-hover:text-gray-600" />
    </button>
  );
}
