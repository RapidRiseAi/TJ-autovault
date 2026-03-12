import type { ReactNode } from 'react';
import { PageContainer } from '@/components/layout/page-container';
import { WorkshopMobileNav } from '@/components/layout/workshop-mobile-nav';
import { WorkshopSubNav } from '@/components/layout/workshop-sub-nav';
import { WorkshopTopNav } from '@/components/layout/workshop-top-nav';

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 via-[#f9f8f6] to-white">
      <WorkshopTopNav />
      <PageContainer className="space-y-6">
        <WorkshopSubNav />
        {children}
      </PageContainer>
      <WorkshopMobileNav />
    </div>
  );
}
