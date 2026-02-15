import { createClient } from '@/lib/supabase/server';

export type CustomerContext = {
  userId: string;
  customerAccountIds: string[];
  primaryCustomerAccountId: string | null;
};

export async function getCurrentCustomerContext(): Promise<CustomerContext | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: memberships } = await supabase
    .from('customer_users')
    .select('customer_account_id,created_at')
    .eq('profile_id', user.id)
    .order('created_at', { ascending: true });

  const customerAccountIds = memberships?.map((membership) => membership.customer_account_id) ?? [];

  return {
    userId: user.id,
    customerAccountIds,
    primaryCustomerAccountId: customerAccountIds[0] ?? null
  };
}
