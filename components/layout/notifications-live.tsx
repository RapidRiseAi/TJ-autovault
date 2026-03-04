'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bell, ChevronRight, Circle, Download, Loader2, Mail, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { markAllNotificationsRead, markNotificationReadState, softDeleteNotification } from '@/lib/actions/customer-notifications';
import { MessageThreadPanel } from '@/components/messages/message-thread-panel';


type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

type Notification = {
  id: string;
  title: string;
  href: string;
  is_read: boolean;
  created_at: string;
  body?: string | null;
  deleted_at?: string | null;
  kind?: string;
  data?: {
    customer_name?: string | null;
    vehicle_registration?: string | null;
    status?: string | null;
    source_table?: string | null;
    message_thread_id?: string | null;
  } | null;
};

export function NotificationsLive({ fullPage = false }: { fullPage?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams();
  const [items, setItems] = useState<Notification[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isWorkshopUser, setIsWorkshopUser] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'messages'>('all');
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());

  const messageThreadFromRoute = searchParams.get('messageThread');
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);
  const [supportsBackgroundPush, setSupportsBackgroundPush] = useState(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState(false);
  const [pushSetupMessage, setPushSetupMessage] = useState<string | null>(null);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    // Do not auto-open from URL; mobile browsers can crash or force-route unexpectedly.
    if (!messageThreadFromRoute) setOpenThreadId(null);
  }, [messageThreadFromRoute]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };

    const onInstalled = () => setInstallPrompt(null);

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }

    setNotificationPermission(Notification.permission);
    setSupportsBackgroundPush(Boolean(window.isSecureContext && 'serviceWorker' in navigator && 'PushManager' in window));
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof Notification !== 'function') return;
    if (!items.length) return;

    if (seenNotificationIdsRef.current.size === 0) {
      items.forEach((item) => seenNotificationIdsRef.current.add(item.id));
      return;
    }

    const newItems = items.filter((item) => !seenNotificationIdsRef.current.has(item.id));
    newItems.forEach((item) => seenNotificationIdsRef.current.add(item.id));

    if (!newItems.length || notificationPermission !== 'granted') return;

    // Avoid immediate in-app notification popups while user is actively on this screen.
    if (document.visibilityState === 'visible') return;

    const latest = newItems[0];
    const targetHref = latest.href || (isWorkshopUser ? '/workshop/notifications' : '/customer/notifications');

    const notification = new Notification(latest.title, {
      body: latest.body ?? 'Open AutoVault to view this update.',
      tag: latest.id,
      data: { href: targetHref }
    });

    notification.onclick = () => {
      window.focus();
      const href = typeof notification.data === 'object' && notification.data && 'href' in notification.data ? String((notification.data as { href?: string }).href ?? '') : '';
      if (href) window.location.assign(href);
      notification.close();
    };
  }, [items, isWorkshopUser, notificationPermission]);

  useEffect(() => {
    let isActive = true;
    let poll: ReturnType<typeof setInterval> | null = null;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    const init = async () => {
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) {
        if (isActive) setIsLoading(false);
        return;
      }
      if (!isActive) return;

      setUid(user.id);

      const [{ data: profile }, { data: customerAccount }] = await Promise.all([
        supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
        supabase.from('customer_accounts').select('id').eq('auth_user_id', user.id).maybeSingle()
      ]);

      if (!isActive) return;

      const isWorkshop = profile?.role === 'admin' || profile?.role === 'technician';
      setIsWorkshopUser(isWorkshop);

      const load = async () => {
        let query = supabase
          .from('notifications')
          .select('id,title,href,is_read,created_at,body,kind,data,deleted_at')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(fullPage ? 100 : 10);

        if (isWorkshop) query = query.eq('to_profile_id', user.id);
        else if (customerAccount?.id) query = query.eq('to_customer_account_id', customerAccount.id);
        else query = query.eq('to_profile_id', user.id);

        const { data, error } = await query;
        if (!isActive) return;

        if (error) {
          setLoadError('Unable to load notifications right now.');
          setItems([]);
        } else {
          setLoadError(null);
          setItems(Array.isArray(data) ? (data as Notification[]) : []);
        }
        setIsLoading(false);
      };

      await load();

      const filter = isWorkshop
        ? `to_profile_id=eq.${user.id}`
        : customerAccount?.id
          ? `to_customer_account_id=eq.${customerAccount.id}`
          : `to_profile_id=eq.${user.id}`;

      channel = supabase
        .channel(`notifications-${user.id}-${fullPage ? 'full' : 'menu'}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter }, () => void load())
        .subscribe();

      poll = setInterval(() => {
        void load();
      }, 10000);
    };

    void init();

    return () => {
      isActive = false;
      if (poll) clearInterval(poll);
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [fullPage, supabase]);

  const unread = items.filter((item) => !item.is_read).length;
  const filteredItems = filter === 'messages' ? items.filter((item) => item.kind === 'message') : items;
  const listHref = isWorkshopUser ? '/workshop/notifications' : '/customer/notifications';
  const itemHref = (item: Notification) => item.href || listHref;


  const subscribeToWebPush = useCallback(async () => {
    if (typeof window === 'undefined') return;
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushSetupMessage('Background push is not available in this browser mode. Try HTTPS and install app/home-screen mode on mobile.');
      return;
    }

    setIsSubscribingPush(true);
    try {
      const registration = await navigator.serviceWorker.register('/push-sw.js');
      const response = await fetch('/api/push/subscribe', { method: 'GET', cache: 'no-store' });
      if (!response.ok) {
        setPushSetupMessage('Unable to load push configuration from server. Please redeploy and try again.');
        return;
      }
      const result = (await response.json()) as { publicVapidKey?: string };
      const publicVapidKey = result.publicVapidKey?.trim();
      if (!publicVapidKey) {
        setPushSetupMessage('Push key is missing on the server. Add VAPID env vars and redeploy.');
        return;
      }

      const toUint8Array = (base64String: string) => {
        const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
        const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
        const rawData = atob(base64);
        return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
      };

      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: toUint8Array(publicVapidKey)
        }));

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(subscription.toJSON())
      });
      setPushSetupMessage('Background push is connected for this device.');
    } catch {
      setPushSetupMessage('Failed to register this device for push. Re-open this page after redeploy and try again.');
    } finally {
      setIsSubscribingPush(false);
    }
  }, []);

  const installAsApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const requestDeviceNotifications = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    if (permission === 'granted') await subscribeToWebPush();
  };

  useEffect(() => {
    if (notificationPermission !== 'granted') return;
    if (!supportsBackgroundPush) return;
    void subscribeToWebPush();
  }, [notificationPermission, subscribeToWebPush, supportsBackgroundPush]);
  if (!uid) return fullPage ? <p className="text-sm text-gray-500">No notifications yet.</p> : null;


  if (!fullPage) {
    return (
      <details className="relative">
        <summary className="cursor-pointer list-none rounded-full border border-black/15 px-2 py-1 text-sm">🔔 {unread}</summary>
        <div className="absolute right-0 z-10 mt-2 w-96 rounded-2xl border bg-white p-3 text-black shadow">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold">Notifications</p>
            <Link href={listHref} className="text-xs text-brand-red underline">View all</Link>
          </div>
          <div className="space-y-1">
            {items.map((item) => (
              <Link key={item.id} href={itemHref(item)} className="block rounded-lg px-2 py-2 text-sm hover:bg-gray-100">
                <p className={item.is_read ? 'text-gray-500' : 'font-semibold'}>{item.title}</p>
              </Link>
            ))}
            {!items.length ? <p className="px-2 py-3 text-xs text-gray-500">No notifications yet.</p> : null}
          </div>
        </div>
      </details>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1 rounded-lg border p-1">
          <Button size="sm" variant={filter === 'all' ? 'primary' : 'ghost'} onClick={() => setFilter('all')}>All</Button>
          <Button size="sm" variant={filter === 'messages' ? 'primary' : 'ghost'} onClick={() => setFilter('messages')}>Messages</Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {notificationPermission !== 'unsupported' ? (
            <Button
              size="sm"
              variant={notificationPermission === 'granted' ? 'outline' : 'secondary'}
              disabled={notificationPermission === 'granted' || isSubscribingPush}
              onClick={() => void requestDeviceNotifications()}
            >
              <Bell className="mr-1 h-4 w-4" />
              {isSubscribingPush ? 'Enabling push…' : notificationPermission === 'granted' ? 'Browser alerts enabled' : 'Enable browser alerts'}
            </Button>
          ) : null}
          {installPrompt ? (
            <Button size="sm" variant="outline" onClick={() => void installAsApp()}>
              <Download className="mr-1 h-4 w-4" /> Install app
            </Button>
          ) : null}
          <Button
            size="sm"
            disabled={unread === 0 || isPending}
            onClick={() => startTransition(async () => {
              await markAllNotificationsRead();
              setItems((prev) => prev.map((item) => ({ ...item, is_read: true })));
            })}
          >
            {isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Mark all as read
          </Button>
        </div>
      </div>
      {notificationPermission === 'denied' ? (
        <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          Device alerts are blocked for this browser. You can re-enable them from your browser site settings.
        </p>
      ) : null}
      {installPrompt ? <p className="text-xs text-gray-500">Install the app for better mobile background notification support.</p> : null}
      {notificationPermission === 'granted' ? (
        <p className="text-xs text-gray-500">
          Browser alerts are enabled.
          {supportsBackgroundPush
            ? ' Background delivery is available on supported browsers after this device is subscribed.'
            : ' This browser does not expose full background push in the current mode (common on some mobile browsers unless installed/home-screen mode is enabled).'}
        </p>
      ) : null}
      {pushSetupMessage ? <p className="text-xs text-gray-500">{pushSetupMessage}</p> : null}
      {isLoading ? Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-2xl bg-gray-100" />) : null}
      {loadError ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{loadError}</p> : null}
      {filteredItems.map((item) => {
        const isMessage = item.kind === 'message';
        return (
          <div key={item.id} className={`rounded-2xl border bg-white p-4 transition hover:border-black/25 ${item.is_read ? 'border-black/10 opacity-80' : 'border-black/20 shadow-sm'} ${isMessage ? 'border-blue-200 bg-blue-50/40' : ''}`}>
            <div className="flex items-start justify-between gap-3">
              <Link href={itemHref(item)} className="group flex flex-1 items-start gap-3">
                <span className={`mt-1 h-10 w-1 rounded-full ${item.is_read ? 'bg-gray-200' : isMessage ? 'bg-blue-500' : 'bg-brand-red'}`} />
                <div className="min-w-0">
                  <p className={item.is_read ? 'text-gray-600' : 'font-semibold text-brand-black'}>{item.title}</p>
                  {isMessage ? <p className="inline-flex items-center gap-1 text-xs font-medium text-blue-700"><Mail className="h-3 w-3" /> Message</p> : null}
                  {item.body ? <p className="text-sm text-gray-600">{item.body}</p> : null}
                  <p className="text-xs text-gray-500">{new Date(item.created_at).toLocaleString()}</p>
                </div>
              </Link>
              <div className="flex flex-col items-end gap-2">
                <span className={`inline-flex items-center gap-1 text-xs ${item.is_read ? 'text-gray-400' : 'text-brand-red'}`}>
                  <Circle className={`h-3 w-3 ${item.is_read ? 'fill-gray-300 text-gray-300' : 'fill-brand-red text-brand-red'}`} />
                  {item.is_read ? 'Read' : 'Unread'}
                </span>
                <div className="flex flex-wrap justify-end gap-1">
                  {isMessage && item.data?.message_thread_id ? (
                    <Button size="sm" variant="outline" onClick={() => setOpenThreadId(item.data?.message_thread_id ?? null)}>Open thread</Button>
                  ) : null}
                  <Button size="sm" variant="secondary" disabled={isPending} onClick={() => startTransition(async () => {
                    await markNotificationReadState({ notificationId: item.id, isRead: !item.is_read });
                    setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, is_read: !n.is_read } : n)));
                  })}>
                    {item.is_read ? 'Mark unread' : 'Mark read'}
                  </Button>
                  <Button size="sm" variant="outline" disabled={isPending} onClick={() => startTransition(async () => {
                    await softDeleteNotification({ notificationId: item.id });
                    setItems((prev) => prev.filter((n) => n.id !== item.id));
                  })}>
                    <Trash2 className="mr-1 h-4 w-4" /> Delete
                  </Button>
                  <Button asChild size="sm" variant="ghost">
                    <Link href={itemHref(item)}>Open <ChevronRight className="ml-1 h-3 w-3" /></Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        );
      })}
      {!isLoading && !filteredItems.length ? <p className="text-sm text-gray-500">No notifications yet.</p> : null}
      <MessageThreadPanel conversationId={openThreadId} open={Boolean(openThreadId)} onClose={() => setOpenThreadId(null)} />
    </div>
  );
}
