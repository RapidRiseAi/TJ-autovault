import './globals.css';
import { ReactNode } from 'react';
import { appConfig } from '@/lib/config/app-config';
import { AppProviders } from '@/components/layout/app-providers';

export const metadata = {
  title: 'autovault',
  description: 'Multi-tenant workshop and customer portal'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-brand-black">
        <AppProviders>{children}</AppProviders>
        {appConfig.branding.defaultWatermarkEnabled && (
          <div className="watermark">
            {appConfig.branding.defaultWatermarkText}
          </div>
        )}
      </body>
    </html>
  );
}
