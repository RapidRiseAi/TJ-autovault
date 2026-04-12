import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/layout/page-header';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

type CustomerTier = 'basic' | 'pro' | 'business';

const GB_IN_BYTES = 1024 * 1024 * 1024;
const EXTRA_STORAGE_PRICE_CENTS_PER_GB = 2000;

const PLAN_OPTIONS: Array<{
  tier: CustomerTier;
  title: string;
  priceLabel: string;
  basePriceCents: number;
  vehicleLimit: number;
  limitLabel: string;
  includedStorageBytes: number;
}> = [
  {
    tier: 'basic',
    title: 'Plan 1',
    priceLabel: 'R200 / month',
    basePriceCents: 20000,
    vehicleLimit: 3,
    limitLabel: '1 to 3 cars · 250MB storage',
    includedStorageBytes: 250 * 1024 * 1024
  },
  {
    tier: 'pro',
    title: 'Plan 2',
    priceLabel: 'R500 / month',
    basePriceCents: 50000,
    vehicleLimit: 10,
    limitLabel: 'Up to 10 cars · 1GB storage',
    includedStorageBytes: 1 * GB_IN_BYTES
  },
  {
    tier: 'business',
    title: 'Plan 3',
    priceLabel: 'R1000 / month',
    basePriceCents: 100000,
    vehicleLimit: 9999,
    limitLabel: 'Unlimited cars · 10GB storage',
    includedStorageBytes: 10 * GB_IN_BYTES
  }
];

async function changePlan(formData: FormData) {
  'use server';

  const selectedTier = (formData.get('tier')?.toString() ?? 'basic') as CustomerTier;
  const nextPlan = PLAN_OPTIONS.find((plan) => plan.tier === selectedTier);
  if (!nextPlan) return;

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!customerUser?.customer_account_id) return;

  const admin = createAdminClient();

  const { data: account } = await admin
    .from('customer_accounts')
    .select('extra_storage_gb')
    .eq('id', customerUser.customer_account_id)
    .maybeSingle();

  const extraStorageGb = Number(account?.extra_storage_gb ?? 0);

  const { error } = await admin
    .from('customer_accounts')
    .update({
      tier: nextPlan.tier,
      vehicle_limit: nextPlan.vehicleLimit,
      included_storage_bytes: nextPlan.includedStorageBytes,
      plan_price_cents:
        nextPlan.basePriceCents + extraStorageGb * EXTRA_STORAGE_PRICE_CENTS_PER_GB
    })
    .eq('id', customerUser.customer_account_id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/customer/plan');
  revalidatePath('/customer/profile');
}

async function markPaidNow() {
  'use server';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!customerUser?.customer_account_id) return;

  const admin = createAdminClient();
  const { error } = await admin
    .from('customer_accounts')
    .update({ onboarding_status: 'active_paid' })
    .eq('id', customerUser.customer_account_id);

  if (error) {
    throw new Error(error.message);
  }

  revalidatePath('/customer/plan');
  revalidatePath('/team/dashboard');
  revalidatePath('/workshop/customers');
}

export default async function CustomerPlanPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const account = customerUser?.customer_account_id
    ? (
        await supabase
          .from('customer_accounts')
          .select('tier,onboarding_status,plan_price_cents')
          .eq('id', customerUser.customer_account_id)
          .maybeSingle()
      ).data
    : null;

  const selectedTier = (account?.tier as CustomerTier | null) ?? 'basic';

  return (
    <main className="space-y-4">
      <PageHeader
        title="Billing & plan"
        subtitle="Change your plan now. Pay now is a temporary test action that marks your account as paid."
      />

      <Card>
        <p className="text-sm text-gray-600">
          Current plan: <span className="font-semibold capitalize text-black">{selectedTier}</span>
        </p>
        <p className="text-sm text-gray-600">
          Account status:{' '}
          <span className="font-semibold text-black">{account?.onboarding_status ?? 'registered_unpaid'}</span>
        </p>
        <p className="text-sm text-gray-600">
          Current monthly amount: <span className="font-semibold text-black">R{((account?.plan_price_cents ?? 0) / 100).toFixed(2)}</span>
        </p>
        <form action={markPaidNow} className="mt-3">
          <Button type="submit">Pay now (test)</Button>
        </form>
      </Card>

      <div className="grid gap-3 md:grid-cols-3">
        {PLAN_OPTIONS.map((plan) => {
          const isCurrent = selectedTier === plan.tier;

          return (
            <Card key={plan.tier}>
              <p className="text-xs uppercase text-gray-500">{plan.title}</p>
              <p className="mt-1 text-xl font-semibold">{plan.priceLabel}</p>
              <p className="text-sm text-gray-600">{plan.limitLabel}</p>
              <form action={changePlan} className="mt-3">
                <input type="hidden" name="tier" value={plan.tier} />
                <Button type="submit" variant={isCurrent ? 'secondary' : 'primary'} disabled={isCurrent}>
                  {isCurrent ? 'Current plan' : 'Switch to this plan'}
                </Button>
              </form>
            </Card>
          );
        })}
      </div>
    </main>
  );
}
