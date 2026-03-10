import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { dispatchNotificationEmailsImmediately } from '@/lib/email/notification-dispatch';

async function runDispatch(notificationIds: string[]) {
  const ids = [...new Set(notificationIds.filter(Boolean))];
  if (!ids.length) return;

  try {
    const admin = createAdminClient();
    await admin
      .from('notification_email_queue')
      .upsert(
        ids.map((notificationId) => ({ notification_id: notificationId })),
        { onConflict: 'notification_id', ignoreDuplicates: true }
      );

    await dispatchNotificationEmailsImmediately(ids);
  } catch {
    // keep user-facing flows resilient; daily cron retry will process pending queue rows.
  }
}

export async function dispatchNotificationEmailsNow(notificationIds: string[]) {
  await runDispatch(notificationIds);
}

export async function dispatchRecentMessageThreadNotifications(conversationId: string) {
  if (!conversationId) return;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('notifications')
      .select('id')
      .eq('kind', 'message')
      .filter('data->>message_thread_id', 'eq', conversationId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);

    const ids = (data ?? []).map((row) => row.id).filter(Boolean) as string[];
    await runDispatch(ids);
  } catch {
    // no-op; queue + cron fallback still applies.
  }
}

export async function dispatchRecentWorkshopNotifications(input: {
  workshopAccountId: string;
  kind: string;
  href: string;
}) {
  if (!input.workshopAccountId) return;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data } = await admin
      .from('notifications')
      .select('id')
      .eq('workshop_account_id', input.workshopAccountId)
      .eq('kind', input.kind)
      .eq('href', input.href)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(10);

    const ids = (data ?? []).map((row) => row.id).filter(Boolean) as string[];
    await runDispatch(ids);
  } catch {
    // no-op; queue + cron fallback still applies.
  }
}

export async function dispatchRecentCustomerNotifications(input: {
  customerAccountId: string;
  kind: string;
  href?: string;
}) {
  if (!input.customerAccountId) return;

  try {
    const admin = createAdminClient();
    const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    let query = admin
      .from('notifications')
      .select('id')
      .eq('to_customer_account_id', input.customerAccountId)
      .eq('kind', input.kind)
      .gte('created_at', since);

    if (input.href) {
      query = query.eq('href', input.href);
    }

    const { data } = await query
      .order('created_at', { ascending: false })
      .limit(10);

    const ids = (data ?? []).map((row) => row.id).filter(Boolean) as string[];
    await runDispatch(ids);
  } catch {
    // no-op; queue + cron fallback still applies.
  }
}
