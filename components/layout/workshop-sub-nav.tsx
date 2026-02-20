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
    <nav className="flex flex-wrap items-center gap-2.5 sm:gap-3">
      {workshopLinks.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex min-h-11 items-center rounded-full border px-5 py-2.5 text-sm font-medium transition-all duration-200',
              isActive
                ? 'scale-[1.01] border-neutral-200 bg-neutral-900 text-white shadow-[0_10px_22px_rgba(15,23,42,0.2)]'
                : 'border-neutral-200 bg-white text-neutral-900 hover:bg-neutral-50'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
