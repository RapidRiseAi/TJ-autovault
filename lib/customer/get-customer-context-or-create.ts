import 'server-only';

import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

type CustomerAccountRow = {
  id: string;
  workshop_account_id: string | null;
};

export type CustomerContext = {
  user: { id: string; email?: string };
  customer_account: CustomerAccountRow;
  workshop_account_id: string;
};

function normalizeTier(tier?: string): 'basic' | 'pro' | 'business' {
  if (tier === 'pro' || tier === 'business') return tier;
  return 'basic';
}

function defaultDisplayName(email?: string, displayName?: string | null) {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;
  const prefix = email?.split('@')[0]?.trim();
  return prefix || 'Customer';
}

async function resolveCustomerAccountForUser(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .eq('auth_user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle();

  return (data as CustomerAccountRow | null) ?? null;
}

async function claimCustomerAccountByEmailFallback(input: {
  userId: string;
  email?: string;
  displayName?: string;
}): Promise<CustomerAccountRow | null> {
  const normalizedEmail = input.email?.trim().toLowerCase();
  if (!normalizedEmail) return null;

  const admin = createAdminClient();

  const { data: candidate } = await admin
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .is('auth_user_id', null)
    .ilike('linked_email', normalizedEmail)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const candidateAccount = (candidate as CustomerAccountRow | null) ?? null;
  if (!candidateAccount?.id || !candidateAccount.workshop_account_id) return null;

  const { data: account } = await admin
    .from('customer_accounts')
    .update({ auth_user_id: input.userId })
    .eq('id', candidateAccount.id)
    .is('auth_user_id', null)
    .select('id,workshop_account_id')
    .maybeSingle();

  const claimed = (account as CustomerAccountRow | null) ?? null;
  if (!claimed?.id || !claimed.workshop_account_id) {
    const existing = await resolveCustomerAccountForUser(input.userId);
    if (existing?.id) return existing;
    return null;
  }

  const preferredDisplayName =
    input.displayName?.trim() || normalizedEmail.split('@')[0] || 'Customer';

  await admin.from('profiles').upsert(
    {
      id: input.userId,
      role: 'customer',
      workshop_account_id: claimed.workshop_account_id,
      display_name: preferredDisplayName
    },
    { onConflict: 'id' }
  );

  await admin.from('customer_users').upsert(
    { customer_account_id: claimed.id, profile_id: input.userId },
    { onConflict: 'customer_account_id,profile_id' }
  );

  return claimed;
}

export async function getCustomerContextOrCreate(
  input?: { displayName?: string; tier?: string; allowAutoCreate?: boolean }
): Promise<CustomerContext | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role === 'admin' || profile?.role === 'technician') {
    return null;
  }

  const { data: claimed, error: claimError } = await supabase.rpc(
    'claim_customer_account_for_current_user',
    { p_email: user.email ?? null }
  );

  const isMissingClaimRpc =
    claimError?.code === 'PGRST202' ||
    claimError?.message
      ?.toLowerCase()
      .includes('claim_customer_account_for_current_user') ||
    false;

  let customerAccount: CustomerAccountRow | null = !claimError
    ? ((claimed as CustomerAccountRow | null) ?? null)
    : null;

  if (!customerAccount && isMissingClaimRpc) {
    customerAccount = await claimCustomerAccountByEmailFallback({
      userId: user.id,
      email: user.email ?? undefined,
      displayName: input?.displayName
    });
  }

  if (!customerAccount) {
    customerAccount = await resolveCustomerAccountForUser(user.id);
  }

  if (!customerAccount && input?.allowAutoCreate) {
    const displayName = defaultDisplayName(
      user.email ?? undefined,
      input?.displayName
    );
    const tier = normalizeTier(input?.tier);

    const { data: ensured } = await supabase.rpc('ensure_customer_account', {
      p_display_name: displayName,
      p_tier: tier
    });

    customerAccount = (ensured as CustomerAccountRow | null) ?? null;

    if (!customerAccount) {
      customerAccount = await resolveCustomerAccountForUser(user.id);
    }
  }

  if (!customerAccount?.workshop_account_id) return null;

  return {
    user: { id: user.id, email: user.email ?? undefined },
    customer_account: {
      id: customerAccount.id,
      workshop_account_id: customerAccount.workshop_account_id
    },
    workshop_account_id: customerAccount.workshop_account_id
  };
}
