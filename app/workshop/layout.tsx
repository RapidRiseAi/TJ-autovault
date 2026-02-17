import Link from 'next/link';
import { ReactNode } from 'react';
import { TopNav } from '@/components/layout/top-nav';

const WORKSHOP_NAV = [
  { href: '/workshop/dashboard', label: 'Dashboard' },
  { href: '/workshop/customers', label: 'Customers' },
  { href: '/notifications', label: 'Notifications' },
  { href: '/workshop/profile', label: 'Profile' }
];

export default function WorkshopLayout({ children }: { children: ReactNode }) {
  return <div><TopNav /><div className="mx-auto max-w-7xl space-y-4 p-6"><nav className="flex flex-wrap gap-2 text-sm">{WORKSHOP_NAV.map((item)=><Link key={item.href} href={item.href} className="rounded border px-3 py-1.5 hover:bg-gray-50">{item.label}</Link>)}</nav>{children}</div></div>;
}
