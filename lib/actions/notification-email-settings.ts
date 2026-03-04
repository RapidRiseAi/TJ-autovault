'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export type NotificationEmailSettings = {
  emailEnabled: boolean;
  notifyMessages: boolean;
  notifyQuotes: boolean;
  notifyInvoices: boolean;
  notifyRequests: boolean;
  notifyReports: boolean;
  notifyRecommendations: boolean;
  notifySystem: boolean;
  notifyJobUpdates: boolean;
  notifyPayouts: boolean;
  recipientOneEmail: string;
  recipientOneLabel: string;
  recipientOneActive: boolean;
  recipientTwoEmail: string;
  recipientTwoLabel: string;
  recipientTwoActive: boolean;
};

export type NotificationEmailSettingsState = {
  ok: boolean;
  message: string;
};

const defaultSettings: NotificationEmailSettings = {
  emailEnabled: true,
  notifyMessages: true,
  notifyQuotes: true,
  notifyInvoices: true,
  notifyRequests: true,
  notifyReports: true,
  notifyRecommendations: true,
  notifySystem: true,
  notifyJobUpdates: true,
  notifyPayouts: true,
  recipientOneEmail: '',
  recipientOneLabel: '',
  recipientOneActive: true,
  recipientTwoEmail: '',
  recipientTwoLabel: '',
  recipientTwoActive: true
};

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === 'on';
}

export async function getNotificationEmailSettings(): Promise<NotificationEmailSettings> {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return defaultSettings;

  const [{ data: prefs }, { data: recipients }] = await Promise.all([
    supabase
      .from('notification_email_preferences')
      .select('email_enabled,notify_messages,notify_quotes,notify_invoices,notify_requests,notify_reports,notify_recommendations,notify_system,notify_job_updates,notify_payouts')
      .eq('profile_id', user.id)
      .maybeSingle(),
    supabase
      .from('notification_email_recipients')
      .select('position,email,label,is_active')
      .eq('profile_id', user.id)
      .order('position', { ascending: true })
  ]);

  const byPos = new Map<number, { email: string | null; label: string | null; is_active: boolean }>();
  (recipients ?? []).forEach((row) => byPos.set(row.position, row));

  const one = byPos.get(1);
  const two = byPos.get(2);

  return {
    emailEnabled: prefs?.email_enabled ?? true,
    notifyMessages: prefs?.notify_messages ?? true,
    notifyQuotes: prefs?.notify_quotes ?? true,
    notifyInvoices: prefs?.notify_invoices ?? true,
    notifyRequests: prefs?.notify_requests ?? true,
    notifyReports: prefs?.notify_reports ?? true,
    notifyRecommendations: prefs?.notify_recommendations ?? true,
    notifySystem: prefs?.notify_system ?? true,
    notifyJobUpdates: prefs?.notify_job_updates ?? true,
    notifyPayouts: prefs?.notify_payouts ?? true,
    recipientOneEmail: one?.email ?? '',
    recipientOneLabel: one?.label ?? '',
    recipientOneActive: one?.is_active ?? true,
    recipientTwoEmail: two?.email ?? '',
    recipientTwoLabel: two?.label ?? '',
    recipientTwoActive: two?.is_active ?? true
  };
}

export async function saveNotificationEmailSettings(
  _prev: NotificationEmailSettingsState,
  formData: FormData
): Promise<NotificationEmailSettingsState> {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, message: 'Please sign in.' };

  const recipientOneEmail = (formData.get('recipientOneEmail')?.toString().trim() ?? '').toLowerCase();
  const recipientTwoEmail = (formData.get('recipientTwoEmail')?.toString().trim() ?? '').toLowerCase();

  if (recipientOneEmail && recipientTwoEmail && recipientOneEmail === recipientTwoEmail) {
    return { ok: false, message: 'Recipient emails must be different.' };
  }

  const nowIso = new Date().toISOString();

  const { error: prefError } = await supabase
    .from('notification_email_preferences')
    .upsert(
      {
        profile_id: user.id,
        email_enabled: checkboxValue(formData, 'emailEnabled'),
        notify_messages: checkboxValue(formData, 'notifyMessages'),
        notify_quotes: checkboxValue(formData, 'notifyQuotes'),
        notify_invoices: checkboxValue(formData, 'notifyInvoices'),
        notify_requests: checkboxValue(formData, 'notifyRequests'),
        notify_reports: checkboxValue(formData, 'notifyReports'),
        notify_recommendations: checkboxValue(formData, 'notifyRecommendations'),
        notify_system: checkboxValue(formData, 'notifySystem'),
        notify_job_updates: checkboxValue(formData, 'notifyJobUpdates'),
        notify_payouts: checkboxValue(formData, 'notifyPayouts'),
        updated_at: nowIso
      },
      { onConflict: 'profile_id' }
    );

  if (prefError) return { ok: false, message: prefError.message };

  const upserts = [
    {
      profile_id: user.id,
      position: 1,
      email: recipientOneEmail,
      label: (formData.get('recipientOneLabel')?.toString().trim() ?? '') || null,
      is_active: checkboxValue(formData, 'recipientOneActive'),
      updated_at: nowIso
    },
    {
      profile_id: user.id,
      position: 2,
      email: recipientTwoEmail,
      label: (formData.get('recipientTwoLabel')?.toString().trim() ?? '') || null,
      is_active: checkboxValue(formData, 'recipientTwoActive'),
      updated_at: nowIso
    }
  ];

  for (const row of upserts) {
    if (!row.email) {
      await supabase
        .from('notification_email_recipients')
        .delete()
        .eq('profile_id', user.id)
        .eq('position', row.position);
      continue;
    }

    const { error } = await supabase
      .from('notification_email_recipients')
      .upsert(row, { onConflict: 'profile_id,position' });

    if (error) return { ok: false, message: error.message };
  }

  revalidatePath('/settings/notifications');
  revalidatePath('/customer/notifications');
  revalidatePath('/workshop/notifications');

  return { ok: true, message: 'Notification email settings saved.' };
}
