import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { buildVapidAuthorization, getVapidPublicKeyForHeader, readVapidConfig } from '@/lib/push/vapid';

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
  to_customer_account_id: string | null;
};

function getRecipientProfileIdByNotification(notification: NotificationRow, customerAccountToProfile: Map<string, string>) {
  if (notification.to_profile_id) return notification.to_profile_id;
  if (!notification.to_customer_account_id) return null;
  return customerAccountToProfile.get(notification.to_customer_account_id) ?? null;
}

async function sendWebPush(endpoint: string) {
  const url = new URL(endpoint);
  const audience = `${url.protocol}//${url.host}`;
  const jwt = buildVapidAuthorization(audience);
  const vapidPublicKey = getVapidPublicKeyForHeader();

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      TTL: '60',
      Urgency: 'high',
      Authorization: `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Crypto-Key': `p256ecdsa=${vapidPublicKey}`,
      'Content-Length': '0'
    }
  });

  return response;
}

export async function dispatchWebPushForNotifications(notificationIds: string[]) {
  if (!notificationIds.length) return;

  try {
    readVapidConfig();
  } catch {
    return;
  }

  const supabase = createAdminClient();

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,body,href,to_profile_id,to_customer_account_id')
    .in('id', notificationIds);

  if (!notifications?.length) return;

  const customerAccountIds = notifications
    .map((notification) => notification.to_customer_account_id)
    .filter((id): id is string => Boolean(id));

  const customerAccountToProfile = new Map<string, string>();
  if (customerAccountIds.length) {
    const { data: customerAccounts } = await supabase
      .from('customer_accounts')
      .select('id,auth_user_id')
      .in('id', customerAccountIds)
      .not('auth_user_id', 'is', null);

    for (const account of customerAccounts ?? []) {
      if (account.id && account.auth_user_id) {
        customerAccountToProfile.set(account.id, account.auth_user_id);
      }
    }
  }

  for (const notification of notifications as NotificationRow[]) {
    const recipientProfileId = getRecipientProfileIdByNotification(notification, customerAccountToProfile);
    if (!recipientProfileId) continue;

    const { data: subscriptions } = await supabase
      .from('push_subscriptions')
      .select('id,endpoint,is_active')
      .eq('profile_id', recipientProfileId)
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
        const response = await sendWebPush(subscription.endpoint);

        if (!response.ok) {
          await supabase.from('push_notification_deliveries').insert({
            notification_id: notification.id,
            push_subscription_id: subscription.id,
            status: 'failed'
          });

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
        await supabase.from('push_notification_deliveries').insert({
          notification_id: notification.id,
          push_subscription_id: subscription.id,
          status: 'failed'
        });
      }
    }
  }
}
