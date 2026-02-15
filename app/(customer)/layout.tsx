import { ReactNode } from 'react';
import { TopNav } from '@/components/layout/top-nav';

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <TopNav />
      <div className="mx-auto max-w-6xl p-6">{children}</div>
    </div>
  );
}
