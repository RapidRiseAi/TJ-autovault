import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { CreateCustomerAccountForm } from '@/components/workshop/create-customer-account-form';
import { CustomersListClient } from '@/components/workshop/customers-list-client';

type CustomerRow = {
  id: string;
  name: string;
  linked_email?: string | null;
  auth_user_id?: string | null;
  onboarding_status?: string | null;
  customer_users?: Array<{
    profiles?: Array<{
      display_name: string | null;
      full_name: string | null;
      avatar_url: string | null;
    }>;
  }>;
};

function isMissingProspectColumnsError(
  error: { code?: string; message?: string } | null
) {
  if (!error) return false;
  const combined = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    combined.includes('linked_email') ||
    combined.includes('onboarding_status') ||
    combined.includes('auth_user_id')
  );
}

export default async function WorkshopCustomersPage() {
  const supabase = await createClient();
  const user = (await supabase.auth.getUser()).data.user;
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role,workshop_account_id')
    .eq('id', user.id)
    .single();
  if (
    !profile?.workshop_account_id ||
    (profile.role !== 'admin' && profile.role !== 'technician')
  )
    redirect('/customer/dashboard');

  const withProspectColumns = await supabase
    .from('customer_accounts')
    .select(
      'id,name,linked_email,auth_user_id,onboarding_status,customer_users(profiles(display_name,full_name,avatar_url))'
    )
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('name');

  const customers =
    withProspectColumns.error &&
    isMissingProspectColumnsError(withProspectColumns.error)
      ? (
          await supabase
            .from('customer_accounts')
            .select('id,name,customer_users(profiles(display_name,full_name,avatar_url))')
            .eq('workshop_account_id', profile.workshop_account_id)
            .order('name')
        ).data
      : withProspectColumns.data;

  const normalizedCustomers = ((customers ?? []) as CustomerRow[]).filter((customer) => customer.name !== '__ONE_TIME_CLIENT__');


  return (
    <main className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle="Paid and unpaid customer records linked to your workshop."
        actions={<CreateCustomerAccountForm />}
      />
      <Card className="rounded-3xl">
        <CustomersListClient customers={normalizedCustomers} />
      </Card>
    </main>
  );
}
