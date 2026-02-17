import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieToSet = { name: string; value: string; options?: CookieOptions };

export type CustomerContext = {
  customerAccountId: string;
  workshopAccountId: string;
  userId: string;
};

function getDefaultCustomerName(
  displayName: string | null,
  email: string | null | undefined
) {
  const trimmedDisplayName = displayName?.trim();
  if (trimmedDisplayName) return trimmedDisplayName;

  const emailPrefix = email?.split('@')[0]?.trim();
  if (emailPrefix) return emailPrefix;

  return 'Customer';
}

export async function getOrCreateCustomerContext(): Promise<CustomerContext | null> {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieToSet[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: initialCustomerAccountId, error: initialCustomerIdError } =
    await supabase.rpc('get_my_customer_account_id');

  if (initialCustomerIdError) throw initialCustomerIdError;

  if (initialCustomerAccountId) {
    const { data: account, error: accountError } = await supabase
      .from('customer_accounts')
      .select('workshop_account_id')
      .eq('id', initialCustomerAccountId)
      .single();

    if (accountError || !account?.workshop_account_id) {
      throw (
        accountError ??
        new Error('Customer account is missing a workshop association')
      );
    }

    return {
      customerAccountId: initialCustomerAccountId as string,
      workshopAccountId: account.workshop_account_id,
      userId: user.id
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('workshop_account_id,display_name')
    .eq('id', user.id)
    .single();

  if (profileError || !profile?.workshop_account_id) {
    throw (
      profileError ??
      new Error('Could not determine workshop account for current user')
    );
  }

  const { error: insertError } = await supabase
    .from('customer_accounts')
    .insert({
      workshop_account_id: profile.workshop_account_id,
      name: getDefaultCustomerName(profile.display_name, user.email),
      tier: 'basic',
      auth_user_id: user.id
    });

  if (insertError) throw insertError;

  const { data: customerAccountId, error: customerIdError } =
    await supabase.rpc('get_my_customer_account_id');

  if (customerIdError) throw customerIdError;

  if (!customerAccountId) {
    throw new Error('Failed to resolve customer account id after bootstrap');
  }

  return {
    customerAccountId,
    workshopAccountId: profile.workshop_account_id,
    userId: user.id
  };
}
