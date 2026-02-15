import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-xl border bg-white p-4 shadow-sm', className)}>{children}</div>;
}
