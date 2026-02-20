import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type EmptyStateProps = {
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({ title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-black/10 bg-white p-6 text-center shadow-[0_10px_30px_rgba(17,17,17,0.06)]',
        className
      )}
    >
      <h2 className="text-base font-semibold text-brand-black">{title}</h2>
      <p className="mt-2 text-sm text-gray-600">{description}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
