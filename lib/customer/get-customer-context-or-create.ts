import 'server-only';

import { createClient } from '@/lib/supabase/server';

const DEFAULT_WORKSHOP_ACCOUNT_ID = '11111111-1111-1111-1111-111111111111';

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

export async function getCustomerContextOrCreate(input?: { displayName?: string; tier?: string }): Promise<CustomerContext | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const displayName = defaultDisplayName(user.email ?? undefined, input?.displayName);
  const tier = normalizeTier(input?.tier);

  const { data: ensured, error: rpcError } = await supabase.rpc('ensure_customer_account', {
    p_display_name: displayName,
    p_tier: tier
  });

  let customerAccount: CustomerAccountRow | null = (ensured as CustomerAccountRow | null) ?? null;

  if (rpcError || !customerAccount) {
    const { data: fallback } = await supabase
      .from('customer_accounts')
      .select('id,workshop_account_id')
      .eq('auth_user_id', user.id)
      .order('created_at', { ascending: true })
      .maybeSingle();

    customerAccount = (fallback as CustomerAccountRow | null) ?? null;
  }

  if (!customerAccount) return null;

  return {
    user: { id: user.id, email: user.email ?? undefined },
    customer_account: {
      id: customerAccount.id,
      workshop_account_id: customerAccount.workshop_account_id ?? DEFAULT_WORKSHOP_ACCOUNT_ID
    },
    workshop_account_id: customerAccount.workshop_account_id ?? DEFAULT_WORKSHOP_ACCOUNT_ID
  };
}
