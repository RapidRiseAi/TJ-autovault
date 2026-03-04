import './globals.css';
import { ReactNode } from 'react';
import { appConfig } from '@/lib/config/app-config';
import { AppProviders } from '@/components/layout/app-providers';
import { WatermarkLink } from '@/components/layout/watermark-link';

export const metadata = {
  title: 'autovault',
  description: 'Multi-tenant workshop and customer portal'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-ZA">
      <body className="min-h-screen bg-white text-brand-black">
        <AppProviders>{children}</AppProviders>
        {appConfig.branding.defaultWatermarkEnabled && <WatermarkLink />}
      </body>
    </html>
  );
}
