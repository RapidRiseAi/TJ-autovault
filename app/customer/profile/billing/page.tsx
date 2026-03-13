import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { splitBillingAddress } from '@/lib/customer/billing-address';

export default async function CustomerBillingPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');

  const { data: membership } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const customerAccountId = membership?.customer_account_id ?? null;

  const { data: billing } = customerAccountId
    ? await supabase
        .from('customer_accounts')
        .select('billing_name,billing_company,billing_email,billing_phone,billing_tax_number,billing_address')
        .eq('id', customerAccountId)
        .maybeSingle()
    : { data: null };

  const address = splitBillingAddress(billing?.billing_address);

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
          <p className="text-sm font-medium text-black">{billing?.billing_name || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Billing company</p>
          <p className="text-sm font-medium text-black">{billing?.billing_company || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Billing email</p>
          <p className="text-sm font-medium text-black">{billing?.billing_email || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Billing phone</p>
          <p className="text-sm font-medium text-black">{billing?.billing_phone || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Billing tax / VAT number</p>
          <p className="text-sm font-medium text-black">{billing?.billing_tax_number || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Street</p>
          <p className="text-sm font-medium text-black">{address.street || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">City</p>
          <p className="text-sm font-medium text-black">{address.city || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Province</p>
          <p className="text-sm font-medium text-black">{address.province || 'Not set'}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Postal code</p>
          <p className="text-sm font-medium text-black">{address.postalCode || 'Not set'}</p>
        </div>
        <Button asChild size="sm"><Link href="/customer/profile/edit">Edit billing details</Link></Button>
      </Card>
    </main>
  );
}
