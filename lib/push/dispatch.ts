import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { buildVapidAuthorization, getVapidPublicKeyForHeader } from '@/lib/push/vapid';

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  is_active: boolean;
};

type NotificationRow = {
  id: string;
  title: string;
  body: string | null;
  href: string;
  to_profile_id: string | null;
};

async function sendWebPush(endpoint: string, payload: { title: string; body: string; href: string }) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = buildVapidAuthorization(audience);
  const vapidPublicKey = getVapidPublicKeyForHeader();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Urgency: 'high',
      Authorization: `WebPush ${jwt}`,
      'Crypto-Key': `p256ecdsa=${vapidPublicKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return response;
}

export async function dispatchWebPushForNotifications(notificationIds: string[]) {
  if (!notificationIds.length) return;
  const hasConfig =
    process.env.WEB_PUSH_VAPID_SUBJECT &&
    process.env.NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY &&
    process.env.WEB_PUSH_VAPID_PRIVATE_KEY;

  if (!hasConfig) return;

  const supabase = createAdminClient();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,body,href,to_profile_id')
    .in('id', notificationIds)
    .not('to_profile_id', 'is', null);

  if (!notifications?.length) return;

  for (const notification of notifications as NotificationRow[]) {
    if (!notification.to_profile_id) continue;

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id,endpoint,is_active')
      .eq('profile_id', notification.to_profile_id)
      .eq('is_active', true);

    if (!subscriptions?.length) continue;

    for (const subscription of subscriptions as PushSubscriptionRow[]) {
      const { data: existingDelivery } = await supabase
        .from('push_notification_deliveries')
        .select('id')
        .eq('notification_id', notification.id)
        .eq('push_subscription_id', subscription.id)
        .maybeSingle();

      if (existingDelivery?.id) continue;

      try {
        const response = await sendWebPush(subscription.endpoint, {
          title: notification.title,
          body: notification.body ?? 'You have a new notification in AutoVault.',
          href: notification.href || '/notifications'
        });

        if (!response.ok) {
          if (response.status === 404 || response.status === 410) {
            await supabase.from('push_subscriptions').update({ is_active: false }).eq('id', subscription.id);
          }
          continue;
        }

        await supabase.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', subscription.id);
        await supabase.from('push_notification_deliveries').insert({
          notification_id: notification.id,
          push_subscription_id: subscription.id,
          status: 'delivered'
        });
      } catch {
        // ignore transient network errors to avoid breaking user flows
      }
    }
  }
}
