'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { getAvatarSrc, getCustomerDisplayName, getInitials, selectBestCustomerProfile } from '@/lib/workshop/customer-display';

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

export function CustomersListClient({ customers }: { customers: CustomerRow[] }) {
  const [sortMode, setSortMode] = useState<'name_asc' | 'name_desc' | 'status'>('name_asc');
  const [onboardingFilter, setOnboardingFilter] = useState<'all' | 'active_paid' | 'registered_unpaid' | 'prospect_unpaid'>('all');
  const [linkageFilter, setLinkageFilter] = useState<'all' | 'linked' | 'unlinked'>('all');

  const sortedCustomers = useMemo(() => {
    const filtered = customers.filter((customer) => {
      const onboarding = (customer.onboarding_status ?? 'prospect_unpaid').toLowerCase();
      const linked = Boolean(customer.linked_email);
      const onboardingMatch = onboardingFilter === 'all' || onboarding === onboardingFilter;
      const linkageMatch = linkageFilter === 'all' || (linkageFilter === 'linked' ? linked : !linked);
      return onboardingMatch && linkageMatch;
    });

    return [...filtered].sort((a, b) => {
      if (sortMode === 'name_desc') return (b.name ?? '').localeCompare(a.name ?? '');
      if (sortMode === 'status') return (a.onboarding_status ?? '').localeCompare(b.onboarding_status ?? '');
      return (a.name ?? '').localeCompare(b.name ?? '');
    });
  }, [customers, linkageFilter, onboardingFilter, sortMode]);

  return (
    <>
      <div className="mb-3 grid gap-2 rounded-2xl border border-black/10 p-3 md:grid-cols-3">
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)} className="rounded-lg border p-2 text-sm">
          <option value="name_asc">Sort: Name A-Z</option>
          <option value="name_desc">Sort: Name Z-A</option>
          <option value="status">Sort: Status</option>
        </select>
        <select value={onboardingFilter} onChange={(e) => setOnboardingFilter(e.target.value as typeof onboardingFilter)} className="rounded-lg border p-2 text-sm">
          <option value="all">Status: All</option>
          <option value="active_paid">Paid</option>
          <option value="registered_unpaid">Registered unpaid</option>
          <option value="prospect_unpaid">Prospect unpaid</option>
        </select>
        <select value={linkageFilter} onChange={(e) => setLinkageFilter(e.target.value as typeof linkageFilter)} className="rounded-lg border p-2 text-sm">
          <option value="all">Linkage: All</option>
          <option value="linked">Linked</option>
          <option value="unlinked">Unlinked</option>
        </select>
      </div>
      <div className="space-y-2">
        {sortedCustomers.map((customer) => {
          const customerProfile = selectBestCustomerProfile(customer.customer_users);
          const customerName = getCustomerDisplayName(customerProfile, customer.name);
          const avatar = getAvatarSrc(customerProfile?.avatar_url);
          return (
            <div key={customer.id} className="flex items-center justify-between rounded-xl border border-black/10 px-2.5 py-1.5 hover:bg-stone-50">
              <div className="flex items-center gap-2">
                {avatar ? (
                  <img src={avatar} alt={customerName} className="h-7 w-7 rounded-full object-cover" />
                ) : (
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-black text-[10px] font-semibold text-white">{getInitials(customerName)}</div>
                )}
                <div>
                  <p className="text-xs font-medium text-brand-black">{customerName}</p>
                  <div className="flex flex-wrap items-center gap-1">
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${statusTone(customer.onboarding_status ?? 'prospect_unpaid')}`}>
                      {(customer.onboarding_status ?? 'prospect_unpaid').replace(/_/g, ' ')}
                    </span>
                    {customer.linked_email ? (
                      <span className="text-[11px] text-gray-500">{customer.linked_email}</span>
                    ) : (
                      <span className="text-[11px] text-gray-400">No linked email</span>
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
        {!sortedCustomers.length ? <p className="py-2 text-sm text-gray-500">No customers yet.</p> : null}
      </div>
    </>
  );
}
