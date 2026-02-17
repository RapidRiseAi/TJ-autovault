import Link from 'next/link';
import { customerDashboard, workshopDashboard } from '@/lib/routes';
import { createClient } from '@/lib/supabase/server';
import { SignOutButton } from '@/components/layout/sign-out-button';
import { NotificationsLive } from '@/components/layout/notifications-live';

export async function TopNav() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const profile = user ? (await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle()).data : null;
  const isWorkshop = profile?.role === 'admin' || profile?.role === 'technician';
  return <header className="border-b bg-black text-white"><div className="mx-auto flex max-w-6xl items-center justify-between p-4"><div className="text-xl font-bold">TJ service & repairs</div><nav className="flex items-center gap-4 text-sm">{isWorkshop ? <Link href={workshopDashboard()}>Workshop</Link> : <Link href={customerDashboard()}>Customer</Link>}<Link href="/notifications">Notifications</Link><NotificationsLive />{user ? <SignOutButton /> : null}</nav></div></header>;
}
