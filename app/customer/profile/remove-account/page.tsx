import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RemoveCustomerAccountButton } from '@/components/customer/remove-customer-account-button';

export default async function CustomerRemoveAccountPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  return (
    <main className="space-y-4">
      <PageHeader
        title="Remove account"
        subtitle="This removes your customer account access from the current workshop."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="space-y-4 rounded-3xl p-5">
        <p className="text-sm text-gray-600">
          This action is permanent and cannot be undone.
        </p>
        <RemoveCustomerAccountButton />
      </Card>
    </main>
  );
}
