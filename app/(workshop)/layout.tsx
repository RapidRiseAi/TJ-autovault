import { ReactNode } from 'react';
import { TopNav } from '@/components/layout/top-nav';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <TopNav />
      <div className="mx-auto max-w-7xl p-6">{children}</div>
    </div>
  );
}
