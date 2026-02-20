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
    <nav className="flex flex-wrap items-center gap-3">
      {workshopLinks.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'rounded-full px-5 py-2.5 text-sm font-medium transition-all duration-200',
              isActive
                ? 'scale-[1.01] bg-black text-white shadow-[0_10px_24px_rgba(0,0,0,0.28)]'
                : 'border border-black/10 bg-white text-gray-700 shadow-sm hover:-translate-y-px hover:bg-stone-50 hover:shadow-[0_8px_18px_rgba(17,17,17,0.12)]'
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
