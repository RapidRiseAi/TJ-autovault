import Link from 'next/link';
import { Bell } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/layout/sign-out-button';

const customerLinks = [
  { href: '/customer/dashboard', label: 'Dashboard' },
  { href: '/customer/notifications', label: 'Notifications' },
  { href: '/customer/profile', label: 'Profile' }
];

export async function AppTopNav() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  const unreadQuery = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('is_read', false);

  const scopedUnread = customerAccount?.id
    ? unreadQuery.eq('to_customer_account_id', customerAccount.id)
    : unreadQuery.eq('to_profile_id', user.id);

  const { count } = await scopedUnread;

  return (
    <header className="sticky top-0 z-40 border-b border-black/10 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-[1320px] items-center justify-between px-4 sm:px-6 lg:px-8">
        <Link href="/customer/dashboard" className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-black sm:text-base">
          TJ service & repairs
        </Link>

        <nav className="hidden items-center justify-center gap-2 md:flex">
          {customerLinks.map((item) => (
            <Link key={item.href} href={item.href} className="rounded-full px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-black hover:text-white">
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link href="/customer/notifications" className="inline-flex items-center gap-1 rounded-full border border-black/15 px-3 py-1.5 text-xs font-semibold text-brand-black hover:bg-gray-100 sm:text-sm">
            <Bell className="h-4 w-4" />
            <span>{count ?? 0}</span>
          </Link>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
