import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-[1320px] px-4 py-4 pb-24 sm:px-6 sm:py-6 sm:pb-8 lg:px-8',
        className
      )}
    >
      {children}
    </div>
  );
}
