import Link from 'next/link';
import { ReactNode } from 'react';
import { TopNav } from '@/components/layout/top-nav';

const CUSTOMER_NAV = [
  { href: '/customer/dashboard', label: 'Dashboard' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/customer/profile', label: 'Profile' }
];

export default function CustomerLayout({ children }: { children: ReactNode }) {
  return <div><TopNav /><div className="mx-auto max-w-6xl space-y-4 p-6"><nav className="flex flex-wrap gap-2 text-sm">{CUSTOMER_NAV.map((item) => <Link key={item.href} href={item.href} className="rounded border px-3 py-1.5 hover:bg-gray-50">{item.label}</Link>)}</nav>{children}</div></div>;
}
