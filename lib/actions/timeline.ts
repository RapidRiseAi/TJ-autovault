'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

function vehiclePaths(vehicleId: string) {
  return [
    `/customer/vehicles/${vehicleId}`,
    `/customer/vehicles/${vehicleId}/timeline`,
    `/workshop/vehicles/${vehicleId}`,
    `/workshop/vehicles/${vehicleId}/timeline`
  ];
}

export async function requestTimelineItemDeletion(input: {
  vehicleId: string;
  targetKind: 'timeline' | 'document';
  targetId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc('request_timeline_item_deletion', {
    p_target_kind: input.targetKind,
    p_target_id: input.targetId,
    p_reason: input.reason
  });

  if (error) return { ok: false, error: error.message };

  vehiclePaths(input.vehicleId).forEach((path) => revalidatePath(path));
  return { ok: true, message: 'Deletion request sent for approval.' };
}

export async function reviewTimelineItemDeletion(input: {
  vehicleId: string;
  requestId: string;
  approve: boolean;
  note?: string;
}): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc('review_timeline_item_deletion', {
    p_request_id: input.requestId,
    p_approve: input.approve,
    p_note: input.note ?? null
  });

  if (error) return { ok: false, error: error.message };

  vehiclePaths(input.vehicleId).forEach((path) => revalidatePath(path));
  return {
    ok: true,
    message: input.approve ? 'Deletion approved.' : 'Deletion request rejected.'
  };
}

export async function createCustomerTimelineLog(input: {
  vehicleId: string;
  title: string;
  details?: string;
  attachment?: {
    documentId: string;
    bucket: string;
    path: string;
    originalName: string;
    contentType: string;
    size: number;
  };
}): Promise<ActionResult> {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) return { ok: false, error: 'Please sign in.' };

  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .select('id,workshop_account_id,current_customer_account_id')
    .eq('id', input.vehicleId)
    .maybeSingle();

  if (vehicleError || !vehicle?.current_customer_account_id) {
    return { ok: false, error: 'Vehicle not found.' };
  }

  const [{ data: customerUser }, { data: profile }] = await Promise.all([
    supabase
    .from('customer_users')
    .select('profile_id')
    .eq('profile_id', user.id)
    .eq('customer_account_id', vehicle.current_customer_account_id)
    .maybeSingle(),
    supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
  ]);

  if (!customerUser) {
    return { ok: false, error: 'You do not have permission for this vehicle.' };
  }

  const attachment = input.attachment
    ? {
        doc_id: input.attachment.documentId,
        bucket: input.attachment.bucket,
        path: input.attachment.path,
        original_name: input.attachment.originalName,
        content_type: input.attachment.contentType,
        size_bytes: input.attachment.size
      }
    : null;

  const { error } = await supabase.from('vehicle_timeline_events').insert({
    workshop_account_id: vehicle.workshop_account_id,
    customer_account_id: vehicle.current_customer_account_id,
    vehicle_id: vehicle.id,
    actor_profile_id: user.id,
    actor_role: 'customer',
    event_type: 'note',
    title: input.title.trim(),
    description: input.details?.trim() || null,
    metadata: {
      source: 'customer_diy_log',
      customer_display_name: profile?.display_name ?? null,
      attachment
    },
    importance: 'info'
  });

  if (error) return { ok: false, error: error.message };

  vehiclePaths(input.vehicleId).forEach((path) => revalidatePath(path));
  return { ok: true, message: 'DIY/service log added to timeline.' };
}
