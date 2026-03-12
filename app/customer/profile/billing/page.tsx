import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default async function CustomerBillingPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('billing_name,company_name,billing_address,phone')
    .eq('id', user.id)
    .maybeSingle();

  return (
    <main className="space-y-4">
      <PageHeader
        title="Billing info"
        subtitle="Your billing contact details used for statements and invoices."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="space-y-3 rounded-3xl p-5">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Billing name</p>
          <p className="text-sm font-medium text-black">{profile?.billing_name || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Company</p>
          <p className="text-sm font-medium text-black">{profile?.company_name || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Address</p>
          <p className="text-sm font-medium text-black">{profile?.billing_address || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Phone</p>
          <p className="text-sm font-medium text-black">{profile?.phone || 'Not set'}</p>
        </div>
        <Button asChild size="sm"><Link href="/customer/profile/edit">Edit billing details</Link></Button>
      </Card>
    </main>
  );
}
