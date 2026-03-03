import 'server-only';

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
    claimError?.message?.toLowerCase().includes('claim_customer_account_for_current_user') ||
    false;

  let customerAccount: CustomerAccountRow | null =
    !claimError || isMissingClaimRpc
      ? ((claimed as CustomerAccountRow | null) ?? null)
      : null;

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
