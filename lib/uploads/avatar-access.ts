type QueryShape = {
  select: (...args: unknown[]) => QueryShape;
  eq: (column: string, value: unknown) => QueryShape;
  in: (column: string, values: unknown[]) => QueryShape;
  limit: (count: number) => QueryShape;
  maybeSingle: () => Promise<{ data: unknown }>;
};

type SupabaseLike = {
  from: (table: string) => unknown;
};

const WORKSHOP_ROLES = new Set(['admin', 'technician']);

export function extractAvatarOwnerId(pathParam: string): string | null {
  const [prefix, ownerId] = pathParam.split('/');
  if (prefix !== 'profiles' || !ownerId) return null;
  return ownerId;
}

export async function canAccessProfileAvatar(
  supabase: SupabaseLike,
  userId: string,
  ownerId: string
): Promise<boolean> {
  if (ownerId === userId) return true;

  const profileQuery = supabase.from('profiles') as QueryShape;
  const { data: actorProfile } = (await profileQuery
    .select('role,workshop_account_id')
    .eq('id', userId)
    .maybeSingle()) as { data: { role?: string; workshop_account_id?: string | null } | null };

  if (!actorProfile?.workshop_account_id || !WORKSHOP_ROLES.has(actorProfile.role ?? '')) {
    return false;
  }

  const membershipQuery = supabase.from('customer_users') as QueryShape;
  const { data: customerMemberships } = (await (membershipQuery
    .select('customer_account_id')
    .eq('profile_id', ownerId) as unknown as Promise<{ data: Array<{ customer_account_id: string }> | null }>));

  const customerAccountIds = (customerMemberships ?? []).map((membership) => membership.customer_account_id);
  if (!customerAccountIds.length) return false;

  const accountQuery = supabase.from('customer_accounts') as QueryShape;
  const { data: linkedAccount } = (await accountQuery
    .select('id')
    .eq('workshop_account_id', actorProfile.workshop_account_id)
    .in('id', customerAccountIds)
    .limit(1)
    .maybeSingle()) as { data: { id: string } | null };

  return Boolean(linkedAccount);
}
