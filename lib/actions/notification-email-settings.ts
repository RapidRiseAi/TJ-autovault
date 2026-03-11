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
  planCode: string;
  notificationSelectionLimit: number | null;
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
  recipientTwoActive: true,
  planCode: '2',
  notificationSelectionLimit: null
};

function normalizePlanCode(input: string | null | undefined) {
  const value = (input ?? '').toString().trim().toLowerCase();
  if (!value) return '2';
  if (['1', 'plan1', 'plan_1', 'basic', 'free'].includes(value)) return '1';
  if (['6', 'plan6', 'plan_6', 'enterprise', 'premium'].includes(value)) return '6';
  if (['2', 'plan2', 'plan_2', 'pro', 'business', 'growth', 'standard'].includes(value)) return '2';
  return value;
}

function defaultsForPlan(planCode: string) {
  if (planCode !== '1') {
    return {
      notifyMessages: true,
      notifyQuotes: true,
      notifyInvoices: true,
      notifyRequests: true,
      notifyReports: true,
      notifyRecommendations: true,
      notifySystem: true,
      notifyJobUpdates: true,
      notifyPayouts: true
    };
  }

  return {
    notifyMessages: true,
    notifyQuotes: true,
    notifyInvoices: true,
    notifyRequests: false,
    notifyReports: false,
    notifyRecommendations: false,
    notifySystem: false,
    notifyJobUpdates: false,
    notifyPayouts: false
  };
}

function notificationLimitForPlan(planCode: string) {
  return planCode === '1' ? 3 : null;
}

async function resolvePlanCode(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, selectedPlan?: string | null) {
  const selected = normalizePlanCode(selectedPlan);
  if (selected === '1' || selected === '2' || selected === '6') return selected;

  const { data: customerMembership } = await supabase
    .from('customer_users')
    .select('customer_account:customer_accounts(tier)')
    .eq('profile_id', userId)
    .maybeSingle();

  const customerTier = (customerMembership?.customer_account as { tier?: string | null } | null)?.tier;
  if (customerTier === 'basic') return '1';
  if (customerTier === 'pro' || customerTier === 'business') return '2';

  const { data: customerAccountByAuth } = await supabase
    .from('customer_accounts')
    .select('tier')
    .eq('auth_user_id', userId)
    .maybeSingle();

  if (customerAccountByAuth?.tier === 'basic') return '1';
  if (customerAccountByAuth?.tier === 'pro' || customerAccountByAuth?.tier === 'business') return '2';

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role === 'admin' || profile?.role === 'technician') {
    const { data: workshop } = await supabase
      .from('workshop_accounts')
      .select('plan')
      .eq('id', profile.workshop_account_id)
      .maybeSingle();

    if (workshop?.plan === 'free') return '1';
    if (workshop?.plan === 'enterprise') return '6';
    return '2';
  }

  return '2';
}

function checkboxValue(formData: FormData, key: string) {
  return formData.get(key) === 'on';
}

export async function getNotificationEmailSettings(): Promise<NotificationEmailSettings> {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return defaultSettings;

  const planCode = await resolvePlanCode(
    supabase,
    user.id,
    (user.user_metadata?.selected_plan as string | undefined) ?? null
  );

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

  const planDefaults = defaultsForPlan(planCode);
  const hasSavedPreferences = Boolean(prefs);

  return {
    emailEnabled: prefs?.email_enabled ?? true,
    notifyMessages: hasSavedPreferences
      ? (prefs?.notify_messages ?? planDefaults.notifyMessages)
      : planDefaults.notifyMessages,
    notifyQuotes: hasSavedPreferences
      ? (prefs?.notify_quotes ?? planDefaults.notifyQuotes)
      : planDefaults.notifyQuotes,
    notifyInvoices: hasSavedPreferences
      ? (prefs?.notify_invoices ?? planDefaults.notifyInvoices)
      : planDefaults.notifyInvoices,
    notifyRequests: hasSavedPreferences
      ? (prefs?.notify_requests ?? planDefaults.notifyRequests)
      : planDefaults.notifyRequests,
    notifyReports: hasSavedPreferences
      ? (prefs?.notify_reports ?? planDefaults.notifyReports)
      : planDefaults.notifyReports,
    notifyRecommendations: hasSavedPreferences
      ? (prefs?.notify_recommendations ?? planDefaults.notifyRecommendations)
      : planDefaults.notifyRecommendations,
    notifySystem: hasSavedPreferences
      ? (prefs?.notify_system ?? planDefaults.notifySystem)
      : planDefaults.notifySystem,
    notifyJobUpdates: hasSavedPreferences
      ? (prefs?.notify_job_updates ?? planDefaults.notifyJobUpdates)
      : planDefaults.notifyJobUpdates,
    notifyPayouts: hasSavedPreferences
      ? (prefs?.notify_payouts ?? planDefaults.notifyPayouts)
      : planDefaults.notifyPayouts,
    recipientOneEmail: one?.email ?? '',
    recipientOneLabel: one?.label ?? '',
    recipientOneActive: one?.is_active ?? true,
    recipientTwoEmail: two?.email ?? '',
    recipientTwoLabel: two?.label ?? '',
    recipientTwoActive: two?.is_active ?? true,
    planCode,
    notificationSelectionLimit: notificationLimitForPlan(planCode)
  };
}

export async function saveNotificationEmailSettings(
  _prev: NotificationEmailSettingsState,
  formData: FormData
): Promise<NotificationEmailSettingsState> {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, message: 'Please sign in.' };

  const planCode = await resolvePlanCode(
    supabase,
    user.id,
    (user.user_metadata?.selected_plan as string | undefined) ?? null
  );
  const notificationSelectionLimit = notificationLimitForPlan(planCode);

  const recipientOneEmail = (formData.get('recipientOneEmail')?.toString().trim() ?? '').toLowerCase();
  const recipientTwoEmail = (formData.get('recipientTwoEmail')?.toString().trim() ?? '').toLowerCase();

  if (recipientOneEmail && recipientTwoEmail && recipientOneEmail === recipientTwoEmail) {
    return { ok: false, message: 'Recipient emails must be different.' };
  }

  const nowIso = new Date().toISOString();

  const selectedEventCount = [
    checkboxValue(formData, 'notifyMessages'),
    checkboxValue(formData, 'notifyQuotes'),
    checkboxValue(formData, 'notifyInvoices'),
    checkboxValue(formData, 'notifyRequests'),
    checkboxValue(formData, 'notifyReports'),
    checkboxValue(formData, 'notifyRecommendations'),
    checkboxValue(formData, 'notifySystem'),
    checkboxValue(formData, 'notifyJobUpdates'),
    checkboxValue(formData, 'notifyPayouts')
  ].filter(Boolean).length;

  if (notificationSelectionLimit !== null && selectedEventCount > notificationSelectionLimit) {
    return {
      ok: false,
      message: `Plan ${planCode} allows up to ${notificationSelectionLimit} notification types. Suggested defaults: Messages, Quotes, and Invoices.`
    };
  }

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
