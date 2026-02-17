import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export async function NotificationsMenu() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return null;

  const [{ data: notifications }, { count }] = await Promise.all([
    supabase.from('notifications').select('id,title,href,is_read,created_at').order('created_at', { ascending: false }).limit(10),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false)
  ]);

  return (
    <details className="relative">
      <summary className="cursor-pointer list-none">🔔 {count ?? 0}</summary>
      <div className="absolute right-0 z-10 mt-2 w-80 rounded border bg-white p-2 text-black shadow">
        <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Notifications</p><Link href="/notifications" className="text-xs text-brand-red underline">View all</Link></div>
        <div className="space-y-1">
          {(notifications ?? []).map((n) => (
            <Link key={n.id} href={`/notifications?open=${n.id}&next=${encodeURIComponent(n.href)}`} className="block rounded px-2 py-1 text-sm hover:bg-gray-100">
              <span className={n.is_read ? 'text-gray-500' : 'font-semibold'}>{n.title}</span>
            </Link>
          ))}
          {!notifications?.length ? <p className="px-2 py-3 text-xs text-gray-500">No notifications yet.</p> : null}
        </div>
      </div>
    </details>
  );
}
