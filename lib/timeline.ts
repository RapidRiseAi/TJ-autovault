import type { SupabaseClient } from '@supabase/supabase-js';

type TimelineEvent = {
  actor_role?: string | null;
  actor_profile_id?: string | null;
  workshop_account_id?: string | null;
  customer_account_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

function clean(value?: string | null) {
  return value?.trim() || null;
}

export async function buildTimelineActorLabel(
  supabase: SupabaseClient,
  event: TimelineEvent
) {
  const actorFlag = clean(
    typeof event.metadata?.actor_flag === 'string' ? event.metadata.actor_flag : null
  );
  if (actorFlag) return actorFlag;
  if (!event.actor_profile_id && event.actor_role !== 'customer') return 'system/automation';

  const { data: actor } = event.actor_profile_id
    ? await supabase
        .from('profiles')
        .select('display_name,full_name,role,id')
        .eq('id', event.actor_profile_id)
        .maybeSingle()
    : { data: null };

  const role = actor?.role ?? event.actor_role;
  const actorName =
    clean(actor?.display_name) || clean(actor?.full_name) || clean(actor?.id) || 'unknown';

  if (role === 'admin') return `workshop/${actorName}`;
  if (role === 'technician') return `technician/${actorName}`;

  if (role === 'customer') {
    if (actorName !== 'unknown') return `customer/${actorName}`;

    if (!event.customer_account_id) return 'customer/unknown';

    const { data: customer } = await supabase
      .from('customer_accounts')
      .select('name')
      .eq('id', event.customer_account_id)
      .maybeSingle();
    return `customer/${clean(customer?.name) || 'unknown'}`;
  }

  return `system/${actorName}`;
}

export function importanceBadgeClass(importance?: string | null) {
  switch (importance) {
    case 'urgent':
      return 'bg-red-100 text-red-700 border-red-200';
    case 'warning':
      return 'bg-amber-100 text-amber-700 border-amber-200';
    default:
      return 'bg-blue-100 text-blue-700 border-blue-200';
  }
}
