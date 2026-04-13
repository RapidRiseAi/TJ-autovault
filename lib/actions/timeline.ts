'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

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

export async function workshopOverrideTimelineItemDeletion(input: {
  vehicleId: string;
  targetKind: 'timeline' | 'document';
  targetId: string;
  reason: string;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const admin = createAdminClient();
  const user = (await supabase.auth.getUser()).data.user;

  if (!user) return { ok: false, error: 'Please sign in.' };

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile) return { ok: false, error: 'Could not load your profile.' };
  if (!['admin', 'technician'].includes(profile.role)) {
    return { ok: false, error: 'Only workshop users can override deletion.' };
  }

  const targetResult = input.targetKind === 'timeline'
    ? await admin
        .from('vehicle_timeline_events')
        .select('id, vehicle_id, workshop_account_id, customer_account_id, title')
        .eq('id', input.targetId)
        .maybeSingle()
    : await admin
        .from('vehicle_documents')
        .select('id, vehicle_id, workshop_account_id, customer_account_id, subject, original_name')
        .eq('id', input.targetId)
        .maybeSingle();

  if (targetResult.error || !targetResult.data) {
    return { ok: false, error: 'Timeline item not found.' };
  }

  const target = targetResult.data as {
    id: string;
    vehicle_id: string;
    workshop_account_id: string;
    customer_account_id: string;
    title?: string | null;
    subject?: string | null;
    original_name?: string | null;
  };

  if (target.workshop_account_id !== profile.workshop_account_id) {
    return { ok: false, error: 'You do not have access to this vehicle.' };
  }

  if (input.targetKind === 'timeline') {
    const { error } = await admin.from('vehicle_timeline_events').delete().eq('id', input.targetId);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error: docDeleteError } = await admin.from('vehicle_documents').delete().eq('id', input.targetId);
    if (docDeleteError) return { ok: false, error: docDeleteError.message };

    const { error: timelineDocDeleteError } = await admin
      .from('vehicle_timeline_events')
      .delete()
      .eq('vehicle_id', target.vehicle_id)
      .eq('event_type', 'doc_uploaded')
      .contains('metadata', { doc_id: input.targetId });
    if (timelineDocDeleteError) return { ok: false, error: timelineDocDeleteError.message };
  }

  const reason = input.reason.trim() || 'No reason provided';
  await admin
    .from('timeline_deletion_requests')
    .update({
      status: 'approved',
      approver_profile_id: user.id,
      approver_note: reason,
      processed_at: new Date().toISOString()
    })
    .eq('vehicle_id', target.vehicle_id)
    .eq('target_kind', input.targetKind)
    .eq('target_id', input.targetId)
    .eq('status', 'pending');

  const deletedTitle =
    target.title ??
    target.subject ??
    target.original_name ??
    `${input.targetKind} item`;
  const { error: logError } = await admin.from('vehicle_timeline_events').insert({
    workshop_account_id: target.workshop_account_id,
    customer_account_id: target.customer_account_id,
    vehicle_id: target.vehicle_id,
    actor_profile_id: user.id,
    actor_role: 'workshop',
    event_type: 'note',
    title: 'Item deleted by workshop override',
    description: `${reason} · Deleted item: ${deletedTitle}`,
    importance: 'warning',
    metadata: {
      source: 'workshop_override_deletion',
      deleted_target_kind: input.targetKind,
      deleted_target_id: input.targetId,
      deleted_target_title: deletedTitle,
      reason
    }
  });
  if (logError) return { ok: false, error: logError.message };

  vehiclePaths(input.vehicleId).forEach((path) => revalidatePath(path));
  return { ok: true, message: 'Item deleted with workshop override.' };
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
