'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, CircleUserRound, House, PlusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

const customerMobileLinks = [
  { href: '/customer/dashboard', label: 'Home', icon: House },
  { href: '/customer/vehicles/new', label: 'Add', icon: PlusCircle },
  { href: '/customer/notifications', label: 'Alerts', icon: Bell },
  { href: '/customer/profile', label: 'Profile', icon: CircleUserRound }
];

export function CustomerMobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/10 bg-white/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 backdrop-blur md:hidden">
      <div className="mx-auto grid w-full max-w-md grid-cols-4 gap-1">
        {customerMobileLinks.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center rounded-2xl text-[11px] font-medium transition',
                isActive
                  ? 'bg-black text-white shadow-[0_10px_20px_rgba(15,23,42,0.22)]'
                  : 'text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900'
              )}
            >
              <Icon className="mb-0.5 h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
