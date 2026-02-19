import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function ActionTile({
  title,
  description,
  icon,
  onClick,
  disabled
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex w-full flex-col rounded-2xl border border-black/10 bg-white p-4 text-left shadow-[0_8px_24px_rgba(17,17,17,0.06)] transition hover:-translate-y-px hover:border-black/20 hover:shadow-[0_12px_28px_rgba(17,17,17,0.08)] disabled:cursor-not-allowed disabled:opacity-50'
      )}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-black">{title}</p>
        {icon ? <span className="text-black/70">{icon}</span> : null}
      </div>
      <p className="text-xs text-gray-500">{description}</p>
    </button>
  );
}
