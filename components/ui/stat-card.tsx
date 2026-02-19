import type { ReactNode } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';

export function StatCard({
  title,
  value,
  detail,
  secondary,
  ring,
  action,
  href
}: {
  title: string;
  value: ReactNode;
  detail?: ReactNode;
  secondary?: ReactNode;
  ring?: ReactNode;
  action?: ReactNode;
  href?: string;
}) {
  const content = (
    <Card className="h-full rounded-2xl border border-black/10 bg-white/95 p-3 shadow-[0_6px_24px_rgba(17,17,17,0.06)]">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gray-500">{title}</p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-base font-semibold text-black sm:text-lg">{value}</p>
          {detail ? <p className="text-xs text-gray-600">{detail}</p> : null}
          {secondary ? <p className="text-[11px] text-gray-500">{secondary}</p> : null}
        </div>
        {ring ? <div className="shrink-0">{ring}</div> : null}
      </div>
      {action ? <div className="mt-3">{action}</div> : null}
    </Card>
  );

  if (!href) return content;
  return (
    <Link href={href} className="block h-full transition hover:-translate-y-px">
      {content}
    </Link>
  );
}
