import { ReactNode } from 'react';
import { AppTopNav } from '@/components/layout/app-top-nav';
import { PageContainer } from '@/components/layout/page-container';

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-[#f9f8f6] to-white">
      <AppTopNav />
      <PageContainer>{children}</PageContainer>
    </div>
  );
}
