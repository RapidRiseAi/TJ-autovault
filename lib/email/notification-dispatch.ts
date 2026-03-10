import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email/resend';

type EmailQueueRow = {
  id: string;
  notification_id: string;
  attempt_count: number;
};

type NotificationRow = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  href: string | null;
  created_at: string;
  to_profile_id: string | null;
  to_customer_account_id: string | null;
  data: Record<string, unknown> | null;
};

type PreferencesRow = {
  email_enabled: boolean;
  notify_messages: boolean;
  notify_quotes: boolean;
  notify_invoices: boolean;
  notify_requests: boolean;
  notify_reports: boolean;
  notify_recommendations: boolean;
  notify_system: boolean;
  notify_job_updates: boolean;
  notify_payouts: boolean;
};

type RecipientRow = {
  email: string;
  is_active: boolean;
  position: number;
};

type EmailAttachment = {
  filename: string;
  content: Buffer;
};

function notificationMatchesPreferences(kind: string, prefs: PreferencesRow) {
  const normalized = (kind || 'system').toLowerCase();
  if (!prefs.email_enabled) return false;
  if (normalized === 'message') return prefs.notify_messages;
  if (normalized === 'quote') return prefs.notify_quotes;
  if (normalized === 'invoice') return prefs.notify_invoices;
  if (normalized === 'request') return prefs.notify_requests;
  if (normalized === 'report') return prefs.notify_reports;
  if (normalized === 'recommendation') return prefs.notify_recommendations;
  if (normalized === 'job') return prefs.notify_job_updates;
  if (normalized === 'payout') return prefs.notify_payouts;
  return prefs.notify_system;
}

function buildNotificationEmailHtml(notification: NotificationRow) {
  const body = notification.body?.trim() || 'You have a new notification in AutoVault.';
  const href = notification.href?.trim() || '/';
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') || '';
  const absoluteHref = href.startsWith('http') ? href : `${appUrl}${href}`;

  return `
    <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #111827;">
      <h2 style="margin: 0 0 12px;">${notification.title}</h2>
      <p style="margin: 0 0 12px;">${body}</p>
      <p style="margin: 0 0 16px; font-size: 12px; color: #6b7280;">${new Date(notification.created_at).toLocaleString()}</p>
      <a href="${absoluteHref}" style="display: inline-block; background: #dc2626; color: #ffffff; padding: 10px 14px; border-radius: 8px; text-decoration: none;">Open notification</a>
    </div>
  `;
}

async function resolveRecipientProfileId(notification: NotificationRow) {
  if (notification.to_profile_id) return notification.to_profile_id;
  if (!notification.to_customer_account_id) return null;

  const admin = createAdminClient();
  const { data } = await admin
    .from('customer_accounts')
    .select('auth_user_id')
    .eq('id', notification.to_customer_account_id)
    .maybeSingle();

  return data?.auth_user_id ?? null;
}

async function resolveCustomerFallbackEmail(notification: NotificationRow) {
  if (!notification.to_customer_account_id) return null;

  const admin = createAdminClient();
  const { data: customerAccount } = await admin
    .from('customer_accounts')
    .select('linked_email,auth_user_id')
    .eq('id', notification.to_customer_account_id)
    .maybeSingle();

  const linkedEmail = customerAccount?.linked_email?.trim().toLowerCase();
  if (linkedEmail) return linkedEmail;

  if (!customerAccount?.auth_user_id) return null;

  try {
    const authUser = await admin.auth.admin.getUserById(customerAccount.auth_user_id);
    return authUser.data.user?.email?.trim().toLowerCase() || null;
  } catch {
    return null;
  }
}

async function resolveNotificationAttachment(notification: NotificationRow): Promise<EmailAttachment | null> {
  const kind = (notification.kind || '').toLowerCase();
  if (kind !== 'quote' && kind !== 'invoice') return null;

  const documentId = typeof notification.data?.document_id === 'string'
    ? notification.data.document_id
    : null;

  if (!documentId) return null;

  const admin = createAdminClient();
  const { data: vehicleDocument } = await admin
    .from('vehicle_documents')
    .select('storage_bucket,storage_path,original_name,mime_type')
    .eq('id', documentId)
    .maybeSingle();

  if (!vehicleDocument?.storage_bucket || !vehicleDocument?.storage_path) return null;
  if (vehicleDocument.mime_type !== 'application/pdf') return null;

  const { data: fileBlob, error: downloadError } = await admin.storage
    .from(vehicleDocument.storage_bucket)
    .download(vehicleDocument.storage_path);

  if (downloadError || !fileBlob) return null;

  const bytes = Buffer.from(await fileBlob.arrayBuffer());
  if (!bytes.length) return null;

  const filename = vehicleDocument.original_name?.trim() || `${kind}.pdf`;

  return {
    filename,
    content: bytes
  };
}


export async function dispatchNotificationEmailsImmediately(notificationIds: string[]) {
  const admin = createAdminClient();
  const ids = [...new Set(notificationIds.filter(Boolean))];
  if (!ids.length) return { processed: 0 };

  let processed = 0;

  for (const notificationId of ids) {
    const nowIso = new Date().toISOString();
    const { data: queueRow } = await admin
      .from('notification_email_queue')
      .select('attempt_count')
      .eq('notification_id', notificationId)
      .maybeSingle();

    const priorAttempts = queueRow?.attempt_count ?? 0;

    const { data: notification } = await admin
      .from('notifications')
      .select('id,kind,title,body,href,created_at,to_profile_id,to_customer_account_id,data')
      .eq('id', notificationId)
      .maybeSingle();

    if (!notification) {
      await admin
        .from('notification_email_queue')
        .update({
          status: 'failed',
          last_error: 'Notification not found',
          attempt_count: priorAttempts + 1,
          last_attempted_at: nowIso,
          updated_at: nowIso
        })
        .eq('notification_id', notificationId);
      processed += 1;
      continue;
    }

    const recipientProfileId = await resolveRecipientProfileId(notification as NotificationRow);
    if (!recipientProfileId) {
      await admin
        .from('notification_email_queue')
        .update({
          status: 'failed',
          last_error: 'No recipient profile',
          attempt_count: priorAttempts + 1,
          last_attempted_at: nowIso,
          updated_at: nowIso
        })
        .eq('notification_id', notificationId);
      processed += 1;
      continue;
    }

    const { data: prefs } = await admin
      .from('notification_email_preferences')
      .select('email_enabled,notify_messages,notify_quotes,notify_invoices,notify_requests,notify_reports,notify_recommendations,notify_system,notify_job_updates,notify_payouts')
      .eq('profile_id', recipientProfileId)
      .maybeSingle();

    const effectivePrefs: PreferencesRow = {
      email_enabled: prefs?.email_enabled ?? true,
      notify_messages: prefs?.notify_messages ?? true,
      notify_quotes: prefs?.notify_quotes ?? true,
      notify_invoices: prefs?.notify_invoices ?? true,
      notify_requests: prefs?.notify_requests ?? true,
      notify_reports: prefs?.notify_reports ?? true,
      notify_recommendations: prefs?.notify_recommendations ?? true,
      notify_system: prefs?.notify_system ?? true,
      notify_job_updates: prefs?.notify_job_updates ?? true,
      notify_payouts: prefs?.notify_payouts ?? true
    };

    if (!notificationMatchesPreferences((notification as NotificationRow).kind, effectivePrefs)) {
      await admin
        .from('notification_email_queue')
        .update({
          status: 'sent',
          sent_at: nowIso,
          last_attempted_at: nowIso,
          updated_at: nowIso,
          attempt_count: priorAttempts + 1,
          last_error: null
        })
        .eq('notification_id', notificationId);
      processed += 1;
      continue;
    }

    const { data: recipients } = await admin
      .from('notification_email_recipients')
      .select('email,is_active,position')
      .eq('profile_id', recipientProfileId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .limit(2);

    const configuredRecipientEmails = (recipients as RecipientRow[] | null | undefined)
      ?.filter((row) => row.email?.trim())
      .map((row) => row.email.trim().toLowerCase()) ?? [];

    const fallbackCustomerEmail = await resolveCustomerFallbackEmail(notification as NotificationRow);
    const recipientEmails = configuredRecipientEmails.length
      ? configuredRecipientEmails
      : (fallbackCustomerEmail ? [fallbackCustomerEmail] : []);

    if (!recipientEmails.length) {
      await admin
        .from('notification_email_queue')
        .update({
          status: 'failed',
          last_error: 'No active notification email recipients',
          attempt_count: priorAttempts + 1,
          last_attempted_at: nowIso,
          updated_at: nowIso
        })
        .eq('notification_id', notificationId);
      processed += 1;
      continue;
    }

    try {
      const html = buildNotificationEmailHtml(notification as NotificationRow);
      const attachment = await resolveNotificationAttachment(notification as NotificationRow);
      const options = attachment ? { attachments: [attachment] } : undefined;
      await Promise.all(recipientEmails.map((email) => sendEmail(email, (notification as NotificationRow).title, html, options)));

      await admin
        .from('notification_email_queue')
        .update({
          status: 'sent',
          sent_at: nowIso,
          last_attempted_at: nowIso,
          updated_at: nowIso,
          attempt_count: priorAttempts + 1,
          last_error: null
        })
        .eq('notification_id', notificationId);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email dispatch error';
      await admin
        .from('notification_email_queue')
        .update({
          status: 'failed',
          last_error: message,
          attempt_count: priorAttempts + 1,
          last_attempted_at: nowIso,
          updated_at: nowIso
        })
        .eq('notification_id', notificationId);
    }

    processed += 1;
  }

  return { processed };
}

export async function dispatchNotificationEmails(options?: { notificationIds?: string[]; limit?: number }) {
  const admin = createAdminClient();
  const limit = options?.limit ?? 50;

  let queueQuery = admin
    .from('notification_email_queue')
    .select('id,notification_id,attempt_count')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(limit);

  if (options?.notificationIds?.length) {
    queueQuery = queueQuery.in('notification_id', options.notificationIds);
  }

  const { data: queueRows } = await queueQuery;
  if (!queueRows?.length) return { processed: 0 };

  let processed = 0;

  for (const queueRow of queueRows as EmailQueueRow[]) {
    const nowIso = new Date().toISOString();
    const { data: notification } = await admin
      .from('notifications')
      .select('id,kind,title,body,href,created_at,to_profile_id,to_customer_account_id,data')
      .eq('id', queueRow.notification_id)
      .maybeSingle();

    if (!notification) {
      await admin
        .from('notification_email_queue')
        .update({ status: 'failed', last_error: 'Notification not found', attempt_count: queueRow.attempt_count + 1, last_attempted_at: nowIso, updated_at: nowIso })
        .eq('id', queueRow.id);
      processed += 1;
      continue;
    }

    const recipientProfileId = await resolveRecipientProfileId(notification as NotificationRow);
    if (!recipientProfileId) {
      await admin
        .from('notification_email_queue')
        .update({ status: 'failed', last_error: 'No recipient profile', attempt_count: queueRow.attempt_count + 1, last_attempted_at: nowIso, updated_at: nowIso })
        .eq('id', queueRow.id);
      processed += 1;
      continue;
    }

    const { data: prefs } = await admin
      .from('notification_email_preferences')
      .select('email_enabled,notify_messages,notify_quotes,notify_invoices,notify_requests,notify_reports,notify_recommendations,notify_system,notify_job_updates,notify_payouts')
      .eq('profile_id', recipientProfileId)
      .maybeSingle();

    const effectivePrefs: PreferencesRow = {
      email_enabled: prefs?.email_enabled ?? true,
      notify_messages: prefs?.notify_messages ?? true,
      notify_quotes: prefs?.notify_quotes ?? true,
      notify_invoices: prefs?.notify_invoices ?? true,
      notify_requests: prefs?.notify_requests ?? true,
      notify_reports: prefs?.notify_reports ?? true,
      notify_recommendations: prefs?.notify_recommendations ?? true,
      notify_system: prefs?.notify_system ?? true,
      notify_job_updates: prefs?.notify_job_updates ?? true,
      notify_payouts: prefs?.notify_payouts ?? true
    };

    if (!notificationMatchesPreferences((notification as NotificationRow).kind, effectivePrefs)) {
      await admin
        .from('notification_email_queue')
        .update({ status: 'sent', sent_at: nowIso, last_attempted_at: nowIso, updated_at: nowIso, attempt_count: queueRow.attempt_count + 1, last_error: null })
        .eq('id', queueRow.id);
      processed += 1;
      continue;
    }

    const { data: recipients } = await admin
      .from('notification_email_recipients')
      .select('email,is_active,position')
      .eq('profile_id', recipientProfileId)
      .eq('is_active', true)
      .order('position', { ascending: true })
      .limit(2);

    const configuredRecipientEmails = (recipients as RecipientRow[] | null | undefined)
      ?.filter((row) => row.email?.trim())
      .map((row) => row.email.trim().toLowerCase()) ?? [];

    const fallbackCustomerEmail = await resolveCustomerFallbackEmail(notification as NotificationRow);
    const recipientEmails = configuredRecipientEmails.length
      ? configuredRecipientEmails
      : (fallbackCustomerEmail ? [fallbackCustomerEmail] : []);

    if (!recipientEmails.length) {
      await admin
        .from('notification_email_queue')
        .update({ status: 'failed', last_error: 'No active notification email recipients', attempt_count: queueRow.attempt_count + 1, last_attempted_at: nowIso, updated_at: nowIso })
        .eq('id', queueRow.id);
      processed += 1;
      continue;
    }

    try {
      const html = buildNotificationEmailHtml(notification as NotificationRow);
      const attachment = await resolveNotificationAttachment(notification as NotificationRow);
      const options = attachment ? { attachments: [attachment] } : undefined;
      await Promise.all(recipientEmails.map((email) => sendEmail(email, (notification as NotificationRow).title, html, options)));

      await admin
        .from('notification_email_queue')
        .update({ status: 'sent', sent_at: nowIso, last_attempted_at: nowIso, updated_at: nowIso, attempt_count: queueRow.attempt_count + 1, last_error: null })
        .eq('id', queueRow.id);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown email dispatch error';
      await admin
        .from('notification_email_queue')
        .update({ status: 'failed', last_error: message, attempt_count: queueRow.attempt_count + 1, last_attempted_at: nowIso, updated_at: nowIso })
        .eq('id', queueRow.id);
    }

    processed += 1;
  }

  return { processed };
}
