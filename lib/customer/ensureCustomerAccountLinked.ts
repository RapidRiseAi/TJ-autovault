import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type LinkedCustomerAccount = {
  id: string;
  workshop_account_id: string;
};

function getDefaultWorkshopAccountId() {
  return (
    process.env.DEFAULT_WORKSHOP_ACCOUNT_ID ??
    process.env.NEXT_PUBLIC_DEFAULT_WORKSHOP_ACCOUNT_ID ??
    '11111111-1111-1111-1111-111111111111'
  );
}

function deriveDisplayName(displayName: string | null, email?: string) {
  const trimmed = displayName?.trim();
  if (trimmed) return trimmed;

  const emailPrefix = email?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;

  return 'Customer';
}

async function getLinkedCustomerAccountId(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .eq('auth_user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle();

  return (data as LinkedCustomerAccount | null) ?? null;
}

export async function ensureCustomerAccountLinked() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const existing = await getLinkedCustomerAccountId(user.id);
  if (existing) return existing;

  const workshopAccountId = getDefaultWorkshopAccountId();

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('display_name,workshop_account_id')
    .eq('id', user.id)
    .maybeSingle();

  const displayName = deriveDisplayName(existingProfile?.display_name ?? null, user.email);

  const linkWithSessionClient = async () => {
    const { error: profileError } = await supabase.from('profiles').upsert(
      {
        id: user.id,
        role: 'customer',
        display_name: displayName,
        workshop_account_id: existingProfile?.workshop_account_id ?? workshopAccountId
      },
      { onConflict: 'id' }
    );

    if (profileError) throw profileError;

    const { data: customerAccount, error: customerAccountError } = await supabase
      .from('customer_accounts')
      .upsert(
        {
          auth_user_id: user.id,
          workshop_account_id: existingProfile?.workshop_account_id ?? workshopAccountId,
          name: displayName,
          tier: 'free'
        },
        { onConflict: 'auth_user_id' }
      )
      .select('id')
      .single();

    if (customerAccountError || !customerAccount) throw customerAccountError;

    const { error: membershipError } = await supabase.from('customer_users').upsert(
      {
        customer_account_id: customerAccount.id,
        profile_id: user.id
      },
      { onConflict: 'customer_account_id,profile_id' }
    );

    if (membershipError) throw membershipError;
  };

  try {
    await linkWithSessionClient();
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    if (code !== '42501') throw error;

    const admin = createAdminClient();

    const { error: profileError } = await admin.from('profiles').upsert(
      {
        id: user.id,
        role: 'customer',
        display_name: displayName,
        workshop_account_id: existingProfile?.workshop_account_id ?? workshopAccountId
      },
      { onConflict: 'id' }
    );

    if (profileError) throw profileError;

    const { data: customerAccount, error: customerAccountError } = await admin
      .from('customer_accounts')
      .upsert(
        {
          auth_user_id: user.id,
          workshop_account_id: existingProfile?.workshop_account_id ?? workshopAccountId,
          name: displayName,
          tier: 'free'
        },
        { onConflict: 'auth_user_id' }
      )
      .select('id')
      .single();

    if (customerAccountError || !customerAccount) {
      throw customerAccountError ?? new Error('Failed to provision customer account');
    }

    const { error: membershipError } = await admin.from('customer_users').upsert(
      {
        customer_account_id: customerAccount.id,
        profile_id: user.id
      },
      { onConflict: 'customer_account_id,profile_id' }
    );

    if (membershipError) throw membershipError;
  }

  return await getLinkedCustomerAccountId(user.id);
}
