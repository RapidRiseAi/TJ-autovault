'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Notification = { id: string; title: string; href: string; is_read: boolean; created_at: string; body?: string | null };

export function NotificationsLive({ fullPage = false }: { fullPage?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Notification[]>([]);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;
    (async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) return;
      setUid(user.id);
      const load = async () => {
        const { data } = await supabase.from('notifications').select('id,title,href,is_read,created_at,body').eq('to_profile_id', user.id).order('created_at', { ascending: false }).limit(fullPage ? 100 : 10);
        setItems((data ?? []) as Notification[]);
      };
      await load();
      const channel = supabase.channel(`notifications-${user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `to_profile_id=eq.${user.id}` }, () => { void load(); }).subscribe((status) => {
        if (status !== 'SUBSCRIBED' && !poll) poll = setInterval(() => void load(), 10000);
      });
      return () => { channel.unsubscribe(); if (poll) clearInterval(poll); };
    })();
  }, [fullPage, supabase]);

  if (!uid) return null;
  const unread = items.filter((n) => !n.is_read).length;
  if (!fullPage) {
    return <details className="relative"><summary className="cursor-pointer list-none">🔔 {unread}</summary><div className="absolute right-0 z-10 mt-2 w-80 rounded border bg-white p-2 text-black shadow"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Notifications</p><Link href="/notifications" className="text-xs text-brand-red underline">View all</Link></div><div className="space-y-1">{items.map((n)=><Link key={n.id} href={`/notifications?open=${n.id}&next=${encodeURIComponent(n.href)}`} className="block rounded px-2 py-1 text-sm hover:bg-gray-100"><span className={n.is_read ? 'text-gray-500' : 'font-semibold'}>{n.title}</span></Link>)}{!items.length ? <p className="px-2 py-3 text-xs text-gray-500">No notifications yet.</p> : null}</div></div></details>;
  }
  return <div className="space-y-2">{items.map((item)=><Link key={item.id} className="block rounded border p-3" href={`/notifications?open=${item.id}&next=${encodeURIComponent(item.href)}`}><p className={item.is_read ? 'text-gray-600' : 'font-semibold'}>{item.title}</p>{item.body ? <p className="text-sm text-gray-600">{item.body}</p> : null}<p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</p></Link>)}{!items.length ? <p className="text-sm text-gray-500">No notifications yet.</p> : null}</div>;
}
