'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const workshopLinks = [
  { href: '/workshop/dashboard', label: 'Dashboard' },
  { href: '/workshop/management', label: 'Management' },
  { href: '/workshop/customers', label: 'Customers' },
  { href: '/workshop/work-requests', label: 'Work requests' },
  { href: '/workshop/technicians', label: 'Technicians' },
  { href: '/workshop/timeline', label: 'Timeline' },
  { href: '/workshop/statements', label: 'Statements' },
  { href: '/workshop/vehicle-deletions', label: 'Vehicle deletions' },
  { href: '/workshop/notifications', label: 'Notifications' },
  { href: '/workshop/profile', label: 'Profile' }
];

export function WorkshopSubNav() {
  const pathname = usePathname();

  return (
    <nav className="no-scrollbar -mx-1 flex snap-x snap-mandatory items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
      {workshopLinks.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'inline-flex min-h-11 shrink-0 snap-start items-center rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 sm:px-5',
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
