'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateNotificationViews() {
  revalidatePath('/customer/notifications');
  revalidatePath('/customer/dashboard');
}

export async function markNotificationReadState(input: { notificationId: string; isRead: boolean }): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: input.isRead })
    .eq('id', input.notificationId)
    .eq('to_customer_account_id', context.customer_account.id)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };
  revalidateNotificationViews();
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };

  const { error } = await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('to_customer_account_id', context.customer_account.id)
    .eq('is_read', false)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };
  revalidateNotificationViews();
  return { ok: true };
}

export async function softDeleteNotification(input: { notificationId: string }): Promise<ActionResult> {
  const supabase = await createClient();
  const context = await getCustomerContextOrCreate();
  if (!context) return { ok: false, error: 'Please sign in.' };

  const { error } = await supabase
    .from('notifications')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', input.notificationId)
    .eq('to_customer_account_id', context.customer_account.id)
    .is('deleted_at', null);

  if (error) return { ok: false, error: error.message };
  revalidateNotificationViews();
  return { ok: true };
}
