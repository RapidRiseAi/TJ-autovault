'use server';

import { createClient } from '@/lib/supabase/server';
import { ensureCustomerAccountLinked } from '@/lib/customer/ensureCustomerAccountLinked';

const PLANS = {
  basic: { vehicleLimit: 1, priceCents: 10000 },
  pro: { vehicleLimit: 10, priceCents: 70000 },
  business: { vehicleLimit: 20, priceCents: 120000 }
} as const;

export async function finalizeSignupPlan(plan: keyof typeof PLANS, displayName: string) {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) return { ok: false, error: 'Not signed in after signup.' };

  const account = await ensureCustomerAccountLinked();
  if (!account) return { ok: false, error: 'Could not provision customer account.' };

  const planMeta = PLANS[plan];
  await supabase.from('profiles').update({ display_name: displayName || user.email?.split('@')[0] || 'Customer', role: 'customer' }).eq('id', user.id);
  const { error } = await supabase
    .from('customer_accounts')
    .update({ tier: plan, vehicle_limit: planMeta.vehicleLimit, plan_price_cents: planMeta.priceCents, subscription_status: 'active' })
    .eq('id', account.id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
