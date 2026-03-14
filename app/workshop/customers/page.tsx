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

type CustomerRow = {
  id: string;
  name: string;
  linked_email?: string | null;
  onboarding_status?: string | null;
  customer_users?: Array<{
    profiles?: Array<{
      display_name: string | null;
      full_name: string | null;
      avatar_url: string | null;
    }>;
  }>;
};

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

export default async function WorkshopCustomersPage({
  searchParams
}: {
  searchParams?: Promise<{ sort?: string; onboarding?: string; linkage?: string }>;
}) {
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
      'id,name,linked_email,onboarding_status,customer_users(profiles(display_name,full_name,avatar_url))'
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

  const normalizedCustomers = (customers ?? []) as CustomerRow[];

  const params = (searchParams ? await searchParams : undefined) ?? {};
  const onboardingFilter = (params.onboarding ?? 'all').toLowerCase();
  const linkageFilter = (params.linkage ?? 'all').toLowerCase();
  const sortMode = (params.sort ?? 'name_asc').toLowerCase();

  const filteredCustomers = normalizedCustomers.filter((customer) => {
    const onboarding = (customer.onboarding_status ?? 'prospect_unpaid').toLowerCase();
    const linked = Boolean(customer.linked_email);

    const onboardingMatch = onboardingFilter === 'all' || onboarding === onboardingFilter;
    const linkageMatch = linkageFilter === 'all' || (linkageFilter === 'linked' ? linked : !linked);
    return onboardingMatch && linkageMatch;
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (sortMode === 'name_desc') return (b.name ?? '').localeCompare(a.name ?? '');
    if (sortMode === 'status') return (a.onboarding_status ?? '').localeCompare(b.onboarding_status ?? '');
    return (a.name ?? '').localeCompare(b.name ?? '');
  });

  return (
    <main className="space-y-4">
      <PageHeader
        title="Customers"
        subtitle="Paid and unpaid customer records linked to your workshop."
        actions={<CreateCustomerAccountForm />}
      />
      <Card className="rounded-3xl">
        <form className="mb-3 grid gap-2 rounded-2xl border border-black/10 p-3 md:grid-cols-3">
          <select name="sort" defaultValue={sortMode} className="rounded-lg border p-2 text-sm">
            <option value="name_asc">Sort: Name A-Z</option>
            <option value="name_desc">Sort: Name Z-A</option>
            <option value="status">Sort: Status</option>
          </select>
          <select name="onboarding" defaultValue={onboardingFilter} className="rounded-lg border p-2 text-sm">
            <option value="all">Status: All</option>
            <option value="active_paid">Paid</option>
            <option value="registered_unpaid">Registered unpaid</option>
            <option value="prospect_unpaid">Prospect unpaid</option>
          </select>
          <select name="linkage" defaultValue={linkageFilter} className="rounded-lg border p-2 text-sm">
            <option value="all">Linkage: All</option>
            <option value="linked">Linked</option>
            <option value="unlinked">Unlinked</option>
          </select>
          <Button type="submit" size="sm" className="md:col-span-3">Apply filters</Button>
        </form>
        <div className="space-y-2">
          {sortedCustomers.map((customer) => {
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
                          customer.onboarding_status ?? 'prospect_unpaid'
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
          {!sortedCustomers.length ? (
            <p className="py-2 text-sm text-gray-500">No customers yet.</p>
          ) : null}
        </div>
      </Card>
    </main>
  );
}
