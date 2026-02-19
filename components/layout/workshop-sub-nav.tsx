'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const workshopLinks = [
  { href: '/workshop/dashboard', label: 'Dashboard' },
  { href: '/workshop/customers', label: 'Customers' },
  { href: '/workshop/work-requests', label: 'Work requests' },
  { href: '/workshop/vehicle-deletions', label: 'Vehicle deletions' },
  { href: '/workshop/notifications', label: 'Notifications' },
  { href: '/workshop/profile', label: 'Profile' }
];

export function WorkshopSubNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap items-center gap-2">
      {workshopLinks.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full px-4 py-2 text-sm font-medium transition-colors',
              isActive ? 'bg-black text-white' : 'border border-black/10 bg-white text-gray-700 hover:bg-black hover:text-white'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
