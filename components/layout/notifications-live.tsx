'use client';

import Link from 'next/link';
import { Bell, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Notification = {
  id: string;
  title: string;
  href: string;
  is_read: boolean;
  created_at: string;
  body?: string | null;
  kind?: string;
  data?: {
    customer_name?: string | null;
    vehicle_registration?: string | null;
    status?: string | null;
    source_table?: string | null;
  } | null;
};

export function NotificationsLive({ fullPage = false }: { fullPage?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Notification[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let poll: ReturnType<typeof setInterval> | null = null;

    const init = async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        setIsLoading(false);
        return;
      }
      setUid(user.id);

      const [{ data: profile }, { data: customerAccount }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
        supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle()
      ]);

      const isWorkshop = profile?.role === 'admin' || profile?.role === 'technician';

      const load = async () => {
        let query = supabase.from('notifications').select('id,title,href,is_read,created_at,body,kind,data').order('created_at', { ascending: false }).limit(fullPage ? 100 : 10);
        if (isWorkshop) {
          query = query.eq('to_profile_id', user.id);
        } else if (customerAccount?.id) {
          query = query.eq('to_customer_account_id', customerAccount.id);
        } else {
          query = query.eq('to_profile_id', user.id);
        }
        const { data } = await query;
        setItems(Array.isArray(data) ? (data as Notification[]) : []);
        setIsLoading(false);
      };

      await load();
      const channel = supabase
        .channel(`notifications-${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications' }, () => {
          void load();
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED' && !poll) poll = setInterval(() => void load(), 10000);
        });

      return () => {
        channel.unsubscribe();
        if (poll) clearInterval(poll);
      };
    };

    void init();
  }, [fullPage, supabase]);

  if (!uid) return null;
  const unread = items.filter((item) => !item.is_read).length;

  if (!fullPage) {
    return (
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full border border-black/15 px-2 py-1 text-sm">🔔 {unread}</summary>
        <div className="absolute right-0 z-10 mt-2 w-96 rounded-2xl border bg-white p-3 text-black shadow">
          <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Notifications</p><Link href="/customer/notifications" className="text-xs text-brand-red underline">View all</Link></div>
          <div className="space-y-1">
            {items.map((item) => (
              <Link key={item.id} href={`/customer/notifications/${item.id}?next=${encodeURIComponent(item.href)}`} className="block rounded-lg px-2 py-2 text-sm hover:bg-gray-100">
                <p className={item.is_read ? 'text-gray-500' : 'font-semibold'}>{item.title}</p>
                {item.data?.customer_name ? <p className="text-xs text-gray-500">Customer: {item.data.customer_name}</p> : null}
                {item.data?.vehicle_registration ? <p className="text-xs text-gray-500">Vehicle: {item.data.vehicle_registration}</p> : null}
              </Link>
            ))}
            {!items.length ? <p className="px-2 py-3 text-xs text-gray-500">No notifications yet.</p> : null}
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-2">
      {isLoading ? (
        Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />)
      ) : null}
      {items.map((item) => (
        <Link key={item.id} className="block rounded-2xl border p-4 transition hover:border-black/25 hover:bg-gray-50" href={`/customer/notifications/${item.id}?next=${encodeURIComponent(item.href)}`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={item.is_read ? 'text-gray-600' : 'font-semibold'}>{item.title}</p>
              {item.body ? <p className="text-sm text-gray-600">{item.body}</p> : null}
              <p className="text-xs text-gray-500">
                {item.data?.customer_name ? `Customer: ${item.data.customer_name} · ` : ''}
                {item.data?.vehicle_registration ? `Vehicle: ${item.data.vehicle_registration} · ` : ''}
                {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
            <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Bell className="h-3 w-3" /> {item.is_read ? 'Read' : 'Unread'} <ChevronRight className="h-3 w-3" /></span>
          </div>
        </Link>
      ))}
      {!isLoading && !items.length ? <p className="text-sm text-gray-500">No notifications yet.</p> : null}
    </div>
  );
}
