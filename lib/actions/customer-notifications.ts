'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateNotificationViews() {
  revalidatePath('/customer/notifications');
  revalidatePath('/customer/dashboard');
  revalidatePath('/workshop/notifications');
  revalidatePath('/workshop/dashboard');
}

async function resolveRecipientScope() {
  const supabase = await createClient();
  const authUser = (await supabase.auth.getUser()).data.user;
  if (!authUser) return { supabase, scope: null as null | { type: 'customer' | 'profile'; id: string } };

  const [{ data: profile }, customerContext] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', authUser.id).maybeSingle(),
    getCustomerContextOrCreate()
  ]);

  if (profile?.role === 'admin' || profile?.role === 'technician') {
    return { supabase, scope: { type: 'profile' as const, id: authUser.id } };
  }

  if (customerContext?.customer_account.id) {
    return { supabase, scope: { type: 'customer' as const, id: customerContext.customer_account.id } };
  }

  return { supabase, scope: { type: 'profile' as const, id: authUser.id } };
}

export async function markNotificationReadState(input: { notificationId: string; isRead: boolean }): Promise<ActionResult> {
  const { supabase, scope } = await resolveRecipientScope();
  if (!scope) return { ok: false, error: 'Please sign in.' };

  let query = supabase.from('notifications').update({ is_read: input.isRead }).eq('id', input.notificationId).is('deleted_at', null);
  query = scope.type === 'customer' ? query.eq('to_customer_account_id', scope.id) : query.eq('to_profile_id', scope.id);

  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  revalidateNotificationViews();
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const { supabase, scope } = await resolveRecipientScope();
  if (!scope) return { ok: false, error: 'Please sign in.' };

  let query = supabase.from('notifications').update({ is_read: true }).eq('is_read', false).is('deleted_at', null);
  query = scope.type === 'customer' ? query.eq('to_customer_account_id', scope.id) : query.eq('to_profile_id', scope.id);

  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  revalidateNotificationViews();
  return { ok: true };
}

export async function softDeleteNotification(input: { notificationId: string }): Promise<ActionResult> {
  const { supabase, scope } = await resolveRecipientScope();
  if (!scope) return { ok: false, error: 'Please sign in.' };

  let query = supabase.from('notifications').update({ deleted_at: new Date().toISOString() }).eq('id', input.notificationId).is('deleted_at', null);
  query = scope.type === 'customer' ? query.eq('to_customer_account_id', scope.id) : query.eq('to_profile_id', scope.id);

  const { error } = await query;
  if (error) return { ok: false, error: error.message };
  revalidateNotificationViews();
  return { ok: true };
}
