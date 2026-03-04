'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getCustomerContextOrCreate } from '@/lib/customer/get-customer-context-or-create';

type MessageResult = { ok: true; conversationId: string } | { ok: false; error: string };

type CreateMessageInput = {
  customerAccountId?: string;
  vehicleId?: string | null;
  subject: string;
  body: string;
};

type ReplyInput = {
  conversationId: string;
  body: string;
  inReplyToMessageId?: string | null;
};

function revalidateMessageViews(conversationId: string, vehicleId?: string | null) {
  const paths = [
    '/customer/dashboard',
    '/workshop/dashboard',
    '/customer/notifications',
    '/workshop/notifications',
    `/customer/notifications?messageThread=${conversationId}`,
    `/workshop/notifications?messageThread=${conversationId}`
  ];

  if (vehicleId) {
    paths.push(`/customer/vehicles/${vehicleId}`);
    paths.push(`/workshop/vehicles/${vehicleId}`);
    paths.push(`/customer/vehicles/${vehicleId}/timeline`);
    paths.push(`/workshop/vehicles/${vehicleId}/timeline`);
  }

  paths.forEach((path) => revalidatePath(path));
}

export async function createMessage(input: CreateMessageInput): Promise<MessageResult> {
  const supabase = await createClient();
  const authUser = (await supabase.auth.getUser()).data.user;
  if (!authUser) return { ok: false, error: 'Please sign in.' };

  const subject = input.subject.trim();
  const body = input.body.trim();
  if (!subject || !body) return { ok: false, error: 'Subject and message are required.' };

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', authUser.id)
    .maybeSingle();

  const isWorkshopUser = profile?.role === 'admin' || profile?.role === 'technician';
  const context = isWorkshopUser ? null : await getCustomerContextOrCreate();

  const customerAccountId = isWorkshopUser ? input.customerAccountId : context?.customer_account.id;
  const vehicleId = input.vehicleId ?? null;

  if (!customerAccountId) return { ok: false, error: 'Please choose a customer.' };

  const { data, error } = await supabase.rpc('create_message_thread_entry', {
    p_customer_account_id: customerAccountId,
    p_workshop_account_id: isWorkshopUser ? profile?.workshop_account_id : null,
    p_vehicle_id: vehicleId,
    p_subject: subject,
    p_body: body
  });

  if (error || !data) return { ok: false, error: error?.message ?? 'Unable to send message.' };

  const result = data as { conversation_id: string; vehicle_id: string | null };
  revalidateMessageViews(result.conversation_id, result.vehicle_id);
  return { ok: true, conversationId: result.conversation_id };
}

export async function replyToMessage(input: ReplyInput): Promise<MessageResult> {
  const supabase = await createClient();
  const authUser = (await supabase.auth.getUser()).data.user;
  if (!authUser) return { ok: false, error: 'Please sign in.' };

  const body = input.body.trim();
  if (!body) return { ok: false, error: 'Reply message is required.' };

  const { data, error } = await supabase.rpc('reply_to_message_thread', {
    p_conversation_id: input.conversationId,
    p_body: body,
    p_in_reply_to_message_id: input.inReplyToMessageId ?? null
  });

  if (error || !data) return { ok: false, error: error?.message ?? 'Unable to send reply.' };

  const result = data as { conversation_id: string; vehicle_id: string | null };
  revalidateMessageViews(result.conversation_id, result.vehicle_id);
  return { ok: true, conversationId: result.conversation_id };
}
