'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { getAvatarSrc, getCustomerDisplayName, getInitials, selectBestCustomerProfile } from '@/lib/workshop/customer-display';
import { PersistedCollapsiblePanel } from '@/components/workshop/persisted-collapsible-panel';

type CustomerRow = {
  id: string;
  name: string;
  created_at: string;
  auth_user_id?: string | null;
  customer_users?: Array<{
    profiles?: Array<{
      display_name: string | null;
      full_name: string | null;
      avatar_url: string | null;
    }>;
  }>;
};

type VehicleRow = {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  status: string | null;
  current_customer_account_id: string | null;
};

type InvoiceRow = {
  id: string;
  vehicle_id: string | null;
  payment_status: string | null;
};

function formatDate(value: string) {
  if (!value) return 'Unknown date';
  return new Date(value).toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

function getVehicleDisplayName(vehicle: { make: string | null; model: string | null; registration_number: string }) {
  const displayName = [vehicle.make, vehicle.model].filter(Boolean).join(' ').trim();
  return displayName || vehicle.registration_number;
}

export function DashboardListsClient({
  customerRows,
  customerVehicles,
  unpaidInvoices,
  customersError
}: {
  customerRows: CustomerRow[];
  customerVehicles: VehicleRow[];
  unpaidInvoices: InvoiceRow[];
  customersError: { message?: string } | null;
}) {
  const [customerSort, setCustomerSort] = useState<'newest' | 'oldest' | 'name'>('newest');
  const [customerLinkage, setCustomerLinkage] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [vehicleSort, setVehicleSort] = useState<'registration' | 'status'>('registration');
  const [vehicleLinkage, setVehicleLinkage] = useState<'all' | 'linked' | 'unlinked'>('all');
  const [vehiclePayment, setVehiclePayment] = useState<'all' | 'paid' | 'unpaid'>('all');

  const customerNameById = useMemo(
    () =>
      new Map(
        customerRows.map((customer) => {
          const profileInfo = selectBestCustomerProfile(customer.customer_users);
          const name = getCustomerDisplayName(profileInfo, customer.name);
          return [customer.id, name];
        })
      ),
    [customerRows]
  );

  const filteredCustomers = useMemo(() => {
    return customerRows
      .filter((customer) => {
        const isLinked = Boolean(customer.auth_user_id);
        if (customerLinkage === 'linked') return isLinked;
        if (customerLinkage === 'unlinked') return !isLinked;
        return true;
      })
      .sort((a, b) => {
        if (customerSort === 'name') return (a.name ?? '').localeCompare(b.name ?? '');
        if (customerSort === 'oldest') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [customerLinkage, customerRows, customerSort]);

  const filteredVehicles = useMemo(() => {
    const unpaidVehicleIds = new Set(
      unpaidInvoices
        .filter((invoice) => invoice.payment_status !== 'paid' && invoice.vehicle_id)
        .map((invoice) => invoice.vehicle_id as string)
    );

    return [...customerVehicles]
      .filter((vehicle) => {
        const hasLinkedCustomer = Boolean(vehicle.current_customer_account_id);
        if (vehicleLinkage === 'linked' && !hasLinkedCustomer) return false;
        if (vehicleLinkage === 'unlinked' && hasLinkedCustomer) return false;
        if (vehiclePayment === 'paid') return !unpaidVehicleIds.has(vehicle.id);
        if (vehiclePayment === 'unpaid') return unpaidVehicleIds.has(vehicle.id);
        return true;
      })
      .sort((a, b) => {
        if (vehicleSort === 'status') return (a.status ?? '').localeCompare(b.status ?? '');
        return a.registration_number.localeCompare(b.registration_number);
      });
  }, [customerVehicles, unpaidInvoices, vehicleLinkage, vehiclePayment, vehicleSort]);

  return (
    <>
      <PersistedCollapsiblePanel
        title="Customers"
        id="dashboard-customers"
        action={<Button asChild size="sm" variant="secondary"><Link href="/workshop/customers">View all</Link></Button>}
      >
        {customersError ? <EmptyState title="Unable to load customers" description="Please refresh and try again." /> : null}
        {!customersError ? (
          <>
            <div className="mb-3 grid gap-2 md:grid-cols-2">
              <select value={customerSort} onChange={(e) => setCustomerSort(e.target.value as typeof customerSort)} className="rounded border p-2 text-sm">
                <option value="newest">Newest first</option>
                <option value="oldest">Oldest first</option>
                <option value="name">Name A-Z</option>
              </select>
              <select value={customerLinkage} onChange={(e) => setCustomerLinkage(e.target.value as typeof customerLinkage)} className="rounded border p-2 text-sm">
                <option value="all">Linked + unlinked</option>
                <option value="linked">Linked only</option>
                <option value="unlinked">Unlinked only</option>
              </select>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              {filteredCustomers.map((customer) => {
                const profileInfo = selectBestCustomerProfile(customer.customer_users);
                const customerName = getCustomerDisplayName(profileInfo, customer.name);
                const avatar = getAvatarSrc(profileInfo?.avatar_url);
                return (
                  <div key={customer.id} className="flex h-full items-center justify-between gap-2 rounded-xl border border-neutral-200/80 bg-white px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                      {avatar ? <img src={avatar} alt={customerName} className="h-8 w-8 rounded-full border border-black/10 object-cover" /> : <div className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-100 text-[10px] font-semibold text-black/80">{getInitials(customerName)}</div>}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-semibold leading-tight text-brand-black">{customerName}</p>
                        <p className="truncate text-[11px] leading-tight text-gray-400">{customer.name}</p>
                        <p className={`text-[10px] font-medium ${customer.auth_user_id ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {customer.auth_user_id ? 'Linked account' : 'Unlinked account'}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <p className="text-xs text-gray-500">{formatDate(customer.created_at)}</p>
                      <Button asChild size="sm" className="min-h-0 min-w-12 border border-brand-red/30 px-2.5 py-0.5 text-[11px] shadow-none"><Link href={`/workshop/customers/${customer.id}`}>Open</Link></Button>
                    </div>
                  </div>
                );
              })}
              {!filteredCustomers.length ? <EmptyState title="No customers yet" description="Customers linked to this workshop will appear here." className="xl:col-span-2" /> : null}
            </div>
          </>
        ) : null}
      </PersistedCollapsiblePanel>

      <PersistedCollapsiblePanel
        title="Vehicle list"
        id="dashboard-vehicles"
        action={<Button asChild size="sm" variant="secondary"><Link href="/workshop/customers">Manage customers</Link></Button>}
      >
        <div className="mb-3 grid gap-2 md:grid-cols-3">
          <select value={vehicleSort} onChange={(e) => setVehicleSort(e.target.value as typeof vehicleSort)} className="rounded border p-2 text-sm">
            <option value="registration">Sort by registration</option>
            <option value="status">Sort by status</option>
          </select>
          <select value={vehicleLinkage} onChange={(e) => setVehicleLinkage(e.target.value as typeof vehicleLinkage)} className="rounded border p-2 text-sm">
            <option value="all">Linked + unlinked</option>
            <option value="linked">Linked only</option>
            <option value="unlinked">Unlinked only</option>
          </select>
          <select value={vehiclePayment} onChange={(e) => setVehiclePayment(e.target.value as typeof vehiclePayment)} className="rounded border p-2 text-sm">
            <option value="all">Paid + unpaid</option>
            <option value="paid">Paid only</option>
            <option value="unpaid">Unpaid only</option>
          </select>
        </div>
        {!filteredVehicles.length ? (
          <EmptyState title="No vehicles yet" description="Vehicles linked to your customers will appear here." />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            {filteredVehicles.map((vehicle) => (
              <div key={vehicle.id} className="rounded-xl border border-neutral-200 p-3">
                <div className="flex items-start justify-between gap-2 sm:flex-row sm:items-center">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-brand-black">{getVehicleDisplayName(vehicle)}</p>
                    <p className="truncate text-xs text-gray-500">{vehicle.registration_number}</p>
                    <p className="truncate text-xs text-gray-400">{vehicle.current_customer_account_id ? customerNameById.get(vehicle.current_customer_account_id) ?? 'Customer unavailable' : 'Customer unavailable'}</p>
                    <span className="mt-2 inline-flex rounded-full border border-black/10 bg-white px-2 py-1 text-[10px] uppercase text-gray-600 sm:hidden">{vehicle.status ?? 'active'}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 sm:justify-end">
                    <span className="hidden rounded-full border border-black/10 bg-white px-2 py-1 text-[10px] uppercase text-gray-600 sm:inline-flex">{vehicle.status ?? 'active'}</span>
                    <Button asChild size="sm" variant="secondary" className="h-7 px-2.5 py-1 text-[11px] sm:h-9 sm:px-3 sm:py-2 sm:text-xs"><Link href={`/workshop/vehicles/${vehicle.id}`}>Open</Link></Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PersistedCollapsiblePanel>
    </>
  );
}
