import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { NotificationsLive } from '@/components/layout/notifications-live';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ open?: string; next?: string }> }) {
  const params = await searchParams;
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  if (params.open) {
    await supabase.from('notifications').update({ is_read: true }).eq('id', params.open).eq('to_profile_id', user.id);
    redirect(params.next || '/notifications');
  }

  return <main className="mx-auto max-w-4xl space-y-4 p-6"><h1 className="text-2xl font-bold">Notifications</h1><div className="flex gap-3 text-sm"><Link className="underline" href="/notifications">Live feed</Link></div><NotificationsLive fullPage /></main>;
}
