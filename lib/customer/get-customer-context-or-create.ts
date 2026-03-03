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
  const { data: byAuth } = await supabase
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .eq('auth_user_id', userId)
    .order('created_at', { ascending: true })
    .maybeSingle();

  const accountByAuth = (byAuth as CustomerAccountRow | null) ?? null;
  if (accountByAuth?.id && accountByAuth.workshop_account_id) {
    return accountByAuth;
  }

  const { data: byMembership } = await supabase
    .from('customer_users')
    .select('customer_accounts!inner(id,workshop_account_id)')
    .eq('profile_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const membershipAccount = (byMembership as {
    customer_accounts?: { id: string; workshop_account_id: string | null } | null;
  } | null)?.customer_accounts;

  if (!membershipAccount?.id || !membershipAccount.workshop_account_id) {
    return null;
  }

  return {
    id: membershipAccount.id,
    workshop_account_id: membershipAccount.workshop_account_id
  };
}

async function reassignCustomerAccountReferences(input: {
  admin: ReturnType<typeof createAdminClient>;
  obsoleteAccountId: string;
  linkedAccountId: string;
}) {
  const { admin, obsoleteAccountId, linkedAccountId } = input;

  const updates: Array<[string, string]> = [
    ['vehicles', 'current_customer_account_id'],
    ['work_orders', 'customer_account_id'],
    ['customer_reports', 'customer_account_id'],
    ['work_requests', 'customer_account_id'],
    ['quotes', 'customer_account_id'],
    ['invoices', 'customer_account_id'],
    ['job_cards', 'customer_account_id'],
    ['vehicle_timeline_events', 'customer_account_id'],
    ['notifications', 'to_customer_account_id']
  ];

  for (const [table, column] of updates) {
    await admin
      .from(table)
      .update({ [column]: linkedAccountId })
      .eq(column, obsoleteAccountId);
  }
}

async function tryDeleteObsoleteCustomerAccount(input: {
  admin: ReturnType<typeof createAdminClient>;
  obsoleteAccountId: string;
  linkedAccountId: string;
}) {
  const { admin, obsoleteAccountId, linkedAccountId } = input;

  await reassignCustomerAccountReferences({ admin, obsoleteAccountId, linkedAccountId });

  await admin
    .from('customer_users')
    .delete()
    .eq('customer_account_id', obsoleteAccountId);

  const { count: remainingVehicleRefs } = await admin
    .from('vehicles')
    .select('id', { count: 'exact', head: true })
    .eq('current_customer_account_id', obsoleteAccountId);

  if ((remainingVehicleRefs ?? 0) > 0) return;

  await admin
    .from('customer_accounts')
    .delete()
    .eq('id', obsoleteAccountId)
    .eq('auth_user_id', null);
}


async function reconcileLinkedEmailCustomer(input: {
  userId: string;
  email?: string;
  displayName?: string;
}): Promise<CustomerAccountRow | null> {
  const normalizedEmail = input.email?.trim().toLowerCase();
  if (!normalizedEmail) {
    return resolveCustomerAccountForUser(input.userId);
  }

  const admin = createAdminClient();
  const { data: linked } = await admin
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .ilike('linked_email', normalizedEmail)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const canonical = (linked as CustomerAccountRow | null) ?? null;
  if (!canonical?.id || !canonical.workshop_account_id) {
    return resolveCustomerAccountForUser(input.userId);
  }

  const { data: duplicateMemberships } = await admin
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', input.userId)
    .neq('customer_account_id', canonical.id);

  for (const membership of duplicateMemberships ?? []) {
    await admin
      .from('customer_users')
      .delete()
      .eq('profile_id', input.userId)
      .eq('customer_account_id', membership.customer_account_id);

    await tryDeleteObsoleteCustomerAccount({
      admin,
      obsoleteAccountId: membership.customer_account_id,
      linkedAccountId: canonical.id
    });
  }

  const { data: duplicatesByAuth } = await admin
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', input.userId)
    .neq('id', canonical.id);

  for (const duplicate of duplicatesByAuth ?? []) {
    await admin
      .from('customer_accounts')
      .update({ auth_user_id: null })
      .eq('id', duplicate.id)
      .eq('auth_user_id', input.userId);

    await tryDeleteObsoleteCustomerAccount({
      admin,
      obsoleteAccountId: duplicate.id,
      linkedAccountId: canonical.id
    });
  }

  await admin
    .from('customer_accounts')
    .update({
      auth_user_id: input.userId,
      onboarding_status: 'registered_unpaid',
      name: input.displayName?.trim() || undefined
    })
    .eq('id', canonical.id);

  await admin.from('customer_users').upsert(
    { customer_account_id: canonical.id, profile_id: input.userId },
    { onConflict: 'customer_account_id,profile_id' }
  );

  return canonical;
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
    .ilike('linked_email', normalizedEmail)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const candidateAccount = (candidate as CustomerAccountRow | null) ?? null;
  if (!candidateAccount?.id || !candidateAccount.workshop_account_id) {
    return resolveCustomerAccountForUser(input.userId);
  }

  const { data: duplicatesByAuth } = await admin
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', input.userId)
    .neq('id', candidateAccount.id);

  for (const duplicate of duplicatesByAuth ?? []) {
    await admin
      .from('customer_accounts')
      .update({ auth_user_id: null })
      .eq('id', duplicate.id)
      .eq('auth_user_id', input.userId);

    await tryDeleteObsoleteCustomerAccount({
      admin,
      obsoleteAccountId: duplicate.id,
      linkedAccountId: candidateAccount.id
    });
  }


  const { data: duplicateMemberships } = await admin
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', input.userId)
    .neq('customer_account_id', candidateAccount.id);

  for (const membership of duplicateMemberships ?? []) {
    await admin
      .from('customer_users')
      .delete()
      .eq('profile_id', input.userId)
      .eq('customer_account_id', membership.customer_account_id);

    await tryDeleteObsoleteCustomerAccount({
      admin,
      obsoleteAccountId: membership.customer_account_id,
      linkedAccountId: candidateAccount.id
    });
  }

  const { data: account } = await admin
    .from('customer_accounts')
    .update({ auth_user_id: input.userId })
    .eq('id', candidateAccount.id)
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
      display_name: preferredDisplayName,
      full_name: input.displayName?.trim() || preferredDisplayName
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

  let customerAccount: CustomerAccountRow | null = !claimError
    ? ((claimed as CustomerAccountRow | null) ?? null)
    : null;

  if (!customerAccount) {
    customerAccount = await claimCustomerAccountByEmailFallback({
      userId: user.id,
      email: user.email ?? undefined,
      displayName: input?.displayName
    });
  }

  if (!customerAccount) {
    customerAccount = await resolveCustomerAccountForUser(user.id);
  }

  customerAccount =
    (await reconcileLinkedEmailCustomer({
      userId: user.id,
      email: user.email ?? undefined,
      displayName: input?.displayName
    })) ?? customerAccount;

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
