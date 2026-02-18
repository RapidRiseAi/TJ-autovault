import { ReactNode } from 'react';
import { AppTopNav } from '@/components/layout/app-top-nav';
import { PageContainer } from '@/components/layout/page-container';

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-white to-gray-50">
      <AppTopNav />
      <PageContainer>{children}</PageContainer>
    </div>
  );
}
