'use client';

import { ReactNode } from 'react';
import { RouteProgress } from '@/components/layout/route-progress';
import { ToastProvider } from '@/components/ui/toast-provider';

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <RouteProgress />
      {children}
    </ToastProvider>
  );
}
