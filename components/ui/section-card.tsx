import type { ReactNode } from 'react';
import { Card } from '@/components/ui/card';

export function SectionCard({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <Card className={`rounded-3xl border border-black/10 bg-white/95 shadow-[0_10px_32px_rgba(17,17,17,0.07)] ${className}`}>{children}</Card>;
}
