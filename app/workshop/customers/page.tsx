import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { Button } from '@/components/ui/button';
import {
  getAvatarSrc,
  getCustomerDisplayName,
  getInitials,
  selectBestCustomerProfile
} from '@/lib/workshop/customer-display';
import { CreateCustomerAccountForm } from '@/components/workshop/create-customer-account-form';

function statusTone(status: string | null) {
  switch (status) {
    case 'active_paid':
      return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    case 'registered_unpaid':
      return 'border-amber-200 bg-amber-50 text-amber-700';
    default:
      return 'border-slate-200 bg-slate-50 text-slate-700';
  }
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

  const { data: customers } = await supabase
    .from('customer_accounts')
    .select(
      'id,name,linked_email,onboarding_status,customer_users(profiles(display_name,full_name,avatar_url))'
    )
    .eq('workshop_account_id', profile.workshop_account_id)
    .order('name');

  return (
    <main className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle="Paid and unpaid customer records linked to your workshop."
        actions={<CreateCustomerAccountForm />}
      />
      <Card className="rounded-3xl">
        <div className="space-y-2">
          {(customers ?? []).map((customer) => {
            const customerProfile = selectBestCustomerProfile(customer.customer_users);
            const customerName = getCustomerDisplayName(
              customerProfile,
              customer.name
            );
            const avatar = getAvatarSrc(customerProfile?.avatar_url);
            return (
              <div
                key={customer.id}
                className="flex items-center justify-between rounded-xl border border-black/10 px-2.5 py-1.5 hover:bg-stone-50"
              >
                <div className="flex items-center gap-2">
                  {avatar ? (
                    <img
                      src={avatar}
                      alt={customerName}
                      className="h-7 w-7 rounded-full object-cover"
                    />
                  ) : (
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px] font-semibold text-white">
                      {getInitials(customerName)}
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-medium text-brand-black">
                      {customerName}
                    </p>
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusTone(
                          customer.onboarding_status
                        )}`}
                      >
                        {(customer.onboarding_status ?? 'prospect_unpaid').replace(
                          /_/g,
                          ' '
                        )}
                      </span>
                      {customer.linked_email ? (
                        <span className="text-[11px] text-gray-500">
                          {customer.linked_email}
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">
                          No linked email
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <Button asChild size="sm" variant="outline">
                  <Link href={`/workshop/customers/${customer.id}`}>Open</Link>
                </Button>
              </div>
            );
          })}
          {!customers?.length ? (
            <p className="py-2 text-sm text-gray-500">No customers yet.</p>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
