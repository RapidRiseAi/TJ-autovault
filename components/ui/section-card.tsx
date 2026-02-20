import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Card } from '@/components/ui/card';

type SectionCardProps = {
  children: ReactNode;
  className?: string;
} & ComponentPropsWithoutRef<'div'>;

export function SectionCard({
  children,
  className = '',
  ...props
}: SectionCardProps) {
  return (
    <Card
      className={`rounded-3xl border border-black/10 bg-white/95 shadow-[0_10px_32px_rgba(17,17,17,0.07)] ${className}`}
      {...props}
    >
      {children}
    </Card>
  );
}
