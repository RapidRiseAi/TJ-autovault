import { createClient } from '@/lib/supabase/server';

export type AccountContext = {
  userId: string;
  role: 'admin' | 'technician' | 'customer';
  workshopAccountId: string;
  customerAccountId: string | null;
};

export async function getAccountContext(): Promise<AccountContext | null> {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();

  if (!profile?.workshop_account_id || !profile.role) return null;

  const { data: customerAccount } = await supabase
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    role: profile.role,
    workshopAccountId: profile.workshop_account_id,
    customerAccountId: customerAccount?.id ?? null
  };
}
