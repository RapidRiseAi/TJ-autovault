import './globals.css';
import { ReactNode } from 'react';
import { appConfig } from '@/lib/config/app-config';

export const metadata = {
  title: 'autovault',
  description: 'Multi-tenant workshop and customer portal'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-brand-black">
        {children}
        {appConfig.branding.defaultWatermarkEnabled && (
          <div className="watermark">{appConfig.branding.defaultWatermarkText}</div>
        )}
      </body>
    </html>
  );
}
