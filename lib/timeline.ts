import type { SupabaseClient } from '@supabase/supabase-js';

type TimelineEvent = {
  actor_role?: string | null;
  actor_profile_id?: string | null;
  workshop_account_id?: string | null;
  customer_account_id?: string | null;
};

export async function buildTimelineActorLabel(supabase: SupabaseClient, event: TimelineEvent) {
  if (!event.actor_profile_id && event.actor_role !== 'customer') return 'System';

  const { data: actor } = event.actor_profile_id
    ? await supabase
        .from('profiles')
        .select('display_name,role')
        .eq('id', event.actor_profile_id)
        .maybeSingle()
    : { data: null };

  const role = actor?.role ?? event.actor_role;
  if (role === 'admin' || role === 'technician') {
    if (!event.workshop_account_id) return 'TJ Service & Repairs';

    const { data: workshop } = await supabase
      .from('workshop_accounts')
      .select('name')
      .eq('id', event.workshop_account_id)
      .maybeSingle();
    return workshop?.name || 'TJ Service & Repairs';
  }

  if (role === 'customer') {
    if (actor?.display_name) return actor.display_name;

    if (!event.customer_account_id) return 'Customer';

    const { data: customer } = await supabase
      .from('customer_accounts')
      .select('name')
      .eq('id', event.customer_account_id)
      .maybeSingle();
    return customer?.name || 'Customer';
  }

  return actor?.display_name || 'Unknown actor';
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
