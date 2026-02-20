import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function HeroHeader({
  title,
  subtitle,
  actions,
  meta,
  media,
  className
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  meta?: ReactNode;
  media?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-3xl border border-black/10 bg-gradient-to-br from-black via-[#151515] to-[#262626] p-6 text-white shadow-[0_16px_50px_rgba(0,0,0,0.28)]',
        className
      )}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-4">
          {media ? <div className="shrink-0">{media}</div> : null}
          <div className="space-y-2">
            <h1 className="text-3xl font-bold tracking-tight sm:text-[2.05rem]">
              {title}
            </h1>
            {subtitle ? (
              <p className="max-w-xl text-xs text-white/70 sm:text-sm">{subtitle}</p>
            ) : null}
            {meta ? (
              <div className="flex flex-wrap gap-2 text-xs text-white/80">
                {meta}
              </div>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </section>
  );
}
