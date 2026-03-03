'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';

function isMissingProspectColumnsError(
  error: { code?: string; message?: string } | null
) {
  if (!error) return false;
  const combined = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    combined.includes('linked_email') ||
    combined.includes('onboarding_status')
  );
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

async function linkCustomerAccountFromWorkshopEmail(input: {
  userId: string;
  email: string;
  displayName?: string;
  phone?: string;
}) {
  const admin = createAdminClient();
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data: candidate, error: candidateError } = await admin
    .from('customer_accounts')
    .select('id,workshop_account_id')
    .ilike('linked_email', normalizedEmail)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (candidateError) {
    if (isMissingProspectColumnsError(candidateError)) return;
    throw new Error(candidateError.message);
  }

  const linkedCustomer =
    (candidate as { id: string; workshop_account_id: string | null } | null) ??
    null;
  if (!linkedCustomer?.id || !linkedCustomer.workshop_account_id) return;

  const { data: duplicatesByAuth } = await admin
    .from('customer_accounts')
    .select('id')
    .eq('auth_user_id', input.userId)
    .neq('id', linkedCustomer.id);

  for (const duplicate of duplicatesByAuth ?? []) {
    await admin
      .from('customer_accounts')
      .update({ auth_user_id: null })
      .eq('id', duplicate.id)
      .eq('auth_user_id', input.userId);

    await tryDeleteObsoleteCustomerAccount({
      admin,
      obsoleteAccountId: duplicate.id,
      linkedAccountId: linkedCustomer.id
    });
  }


  const { data: duplicateMemberships } = await admin
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', input.userId)
    .neq('customer_account_id', linkedCustomer.id);

  for (const membership of duplicateMemberships ?? []) {
    await admin
      .from('customer_users')
      .delete()
      .eq('profile_id', input.userId)
      .eq('customer_account_id', membership.customer_account_id);

    await tryDeleteObsoleteCustomerAccount({
      admin,
      obsoleteAccountId: membership.customer_account_id,
      linkedAccountId: linkedCustomer.id
    });
  }

  const { error: linkError } = await admin
    .from('customer_accounts')
    .update({
      auth_user_id: input.userId,
      onboarding_status: 'registered_unpaid',
      name: input.displayName?.trim() || undefined
    })
    .eq('id', linkedCustomer.id);

  if (linkError && !isMissingProspectColumnsError(linkError)) {
    throw new Error(linkError.message);
  }

  const preferredDisplayName =
    input.displayName?.trim() || normalizedEmail.split('@')[0] || 'Customer';

  await admin.from('profiles').upsert(
    {
      id: input.userId,
      role: 'customer',
      workshop_account_id: linkedCustomer.workshop_account_id,
      display_name: preferredDisplayName,
      full_name: input.displayName?.trim() || preferredDisplayName,
      phone: input.phone?.trim() || null
    },
    { onConflict: 'id' }
  );

  await admin.from('customer_users').upsert(
    { customer_account_id: linkedCustomer.id, profile_id: input.userId },
    { onConflict: 'customer_account_id,profile_id' }
  );
}

export async function signupCustomerAction(formData: FormData) {
  const email = formData.get('email')?.toString().trim() ?? '';
  const password = formData.get('password')?.toString() ?? '';
  const displayName = formData.get('displayName')?.toString().trim() ?? '';
  const plan = formData.get('plan')?.toString() ?? 'basic';
  const phone = formData.get('phone')?.toString().trim() ?? '';

  const tier = plan === 'pro' || plan === 'business' ? plan : 'basic';

  if (!email || !password) {
    redirect('/signup?error=Email%20and%20password%20are%20required');
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName, selected_plan: tier, phone } }
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (!data.user) {
    redirect('/signup?error=Signup%20failed.%20Please%20try%20again.');
  }

  await linkCustomerAccountFromWorkshopEmail({
    userId: data.user.id,
    email,
    displayName,
    phone
  });

  await supabase.auth.signOut();

  redirect('/login?created=1');
}
