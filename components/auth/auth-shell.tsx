import Link from 'next/link';
import { ReactNode } from 'react';
import { AuthTransitionOverlay } from '@/components/auth/auth-transition-overlay';

function PortalOverviewPanel() {
  const items = [
    {
      title: 'Single vehicle timeline',
      text: 'All service activity in one view.'
    },
    {
      title: 'Documents and invoices',
      text: 'Access files when you need them.'
    },
    {
      title: 'Clear status updates',
      text: 'Know what is happening with your vehicle.'
    }
  ];

  return (
    <section className="rounded-2xl border border-black/10 bg-white/80 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mb-4 border-b border-black/10 pb-3">
        <h2 className="text-base font-semibold text-gray-900">Portal overview</h2>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <div key={item.title} className="flex gap-3 rounded-xl border border-black/5 bg-white/70 p-3">
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-50 text-brand-red">
              <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
                <path d="M4 10h12M10 4v12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </span>
            <div>
              <p className="text-sm font-semibold text-gray-900">{item.title}</p>
              <p className="text-xs text-gray-600">{item.text}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-gray-500">Secure access. Your data stays private.</p>
    </section>
  );
}

function TodayPanel() {
  const actions = ['Approve quotes', 'View unpaid invoices', 'Download documents'];

  return (
    <section className="rounded-2xl border border-black/10 bg-white/80 p-5 shadow-[0_22px_60px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/70">
      <div className="mb-4 border-b border-black/10 pb-3">
        <h2 className="text-base font-semibold text-gray-900">Today you can</h2>
      </div>
      <ul className="space-y-2">
        {actions.map((item) => (
          <li key={item} className="rounded-xl border border-black/5 bg-white/70 px-3 py-2 text-sm text-gray-800">
            {item}
          </li>
        ))}
      </ul>
      <div className="mt-4 rounded-xl border border-black/10 bg-white px-3 py-3">
        <p className="text-sm font-semibold text-gray-900">Support</p>
        <p className="mt-1 text-xs text-gray-600">Need help? Contact the workshop.</p>
      </div>
      <p className="mt-4 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
        System online
      </p>
    </section>
  );
}

function MobilePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-2xl border border-black/10 bg-white/80 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/70 lg:hidden">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900">{title}</summary>
      <div className="px-4 pb-4">{children}</div>
    </details>
  );
}

export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.95),rgba(244,244,245,0.95))] text-brand-black">
      <div className="pointer-events-none fixed inset-0 opacity-30 [background-image:linear-gradient(to_right,rgba(17,24,39,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(17,24,39,0.05)_1px,transparent_1px)] [background-size:32px_32px]" />
      <header className="relative z-10 h-16 border-b border-black/10 bg-white/95 shadow-sm backdrop-blur">
        <div className="mx-auto flex h-full w-full max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-500">Customer Portal</p>
            <p className="relative inline-flex items-center text-lg font-semibold text-gray-900">
              TJ Service &amp; Repairs
              <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-brand-red" aria-hidden />
            </p>
          </div>
          <nav className="flex items-center gap-5 text-sm text-gray-600">
            <Link href="#" className="underline-offset-4 hover:underline">Help</Link>
            <Link href="#" className="underline-offset-4 hover:underline">Contact</Link>
            <Link href="#" className="underline-offset-4 hover:underline">Privacy</Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto w-full max-w-[1320px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(220px,1fr)_minmax(0,520px)_minmax(220px,1fr)] lg:items-center">
          <aside className="hidden lg:block">
            <PortalOverviewPanel />
          </aside>

          <section className="mx-auto w-full max-w-[520px]">{children}</section>

          <aside className="hidden lg:block">
            <TodayPanel />
          </aside>
        </div>

        <div className="mt-4 space-y-3 lg:hidden">
          <MobilePanel title="Portal overview">
            <PortalOverviewPanel />
          </MobilePanel>
          <MobilePanel title="Today you can">
            <TodayPanel />
          </MobilePanel>
        </div>
      </div>
      <AuthTransitionOverlay />
    </main>
  );
}
