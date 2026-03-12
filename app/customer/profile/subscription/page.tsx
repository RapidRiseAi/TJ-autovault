import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

function formatMoney(cents: number) {
  return `R ${(cents / 100).toFixed(2)}`;
}

export default async function CustomerSubscriptionPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const { data: account } = customerUser?.customer_account_id
    ? await supabase
        .from('customer_accounts')
        .select('tier,subscription_status,plan_price_cents,vehicle_limit')
        .eq('id', customerUser.customer_account_id)
        .maybeSingle()
    : { data: null };

  return (
    <main className="space-y-4">
      <PageHeader
        title="Subscription"
        subtitle="Your plan type, status, and monthly amount."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="space-y-3 rounded-3xl p-5">
        <p className="text-sm text-gray-600">Plan tier</p>
        <p className="text-lg font-semibold capitalize">{account?.tier ?? 'basic'}</p>
        <p className="text-sm text-gray-600">Plan status</p>
        <p className="text-lg font-semibold capitalize">{account?.subscription_status ?? 'pending'}</p>
        <p className="text-sm text-gray-600">Monthly price</p>
        <p className="text-lg font-semibold">{formatMoney(account?.plan_price_cents ?? 0)}</p>
        <p className="text-sm text-gray-600">Vehicle slots</p>
        <p className="text-lg font-semibold">{account?.vehicle_limit ?? 1}</p>
        <Button asChild size="sm"><Link href="/customer/plan">Open plan page</Link></Button>
      </Card>
    </main>
  );
}
