import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ActionTile({
  title,
  description,
  icon,
  onClick,
  href,
  disabled,
  primary = false,
  compactMobile = false
}: {
  title: string;
  description: string;
  icon?: ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  primary?: boolean;
  compactMobile?: boolean;
}) {
  const className = cn(
    'group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-xl border bg-neutral-50/70 p-4 text-left shadow-[0_10px_24px_rgba(17,17,17,0.09)] transition duration-150 hover:-translate-y-0.5 hover:border-neutral-400 hover:bg-white hover:shadow-[0_14px_30px_rgba(17,17,17,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-red/35 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
    compactMobile ? 'gap-2 p-2.5 sm:gap-3 sm:p-4' : '',
    primary
      ? 'border-brand-red/40 bg-gradient-to-r from-red-50 to-white'
      : 'border-neutral-300'
  );

  const content = (
    <>
      {primary ? (
        <span
          className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-brand-red/65"
          aria-hidden
        />
      ) : null}
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn("inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 text-neutral-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]", compactMobile ? "h-8 w-8 sm:h-9 sm:w-9" : "")}>
          {icon}
        </span>
        <div className="min-w-0">
          <p className={cn("text-sm font-semibold text-black", compactMobile ? "text-xs leading-snug break-words sm:text-sm" : "")}>{title}</p>
          <p className={cn("text-xs text-gray-500", compactMobile ? "hidden sm:block" : "")}>{description}</p>
        </div>
      </div>
      <ChevronRight className={cn("h-4 w-4 shrink-0 text-gray-400 transition group-hover:text-gray-600", compactMobile ? "hidden sm:block" : "")} />
    </>
  );

  if (href) {
    return (
      <Link href={href} className={className} aria-disabled={disabled}>
        {content}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {content}
    </button>
  );
}
