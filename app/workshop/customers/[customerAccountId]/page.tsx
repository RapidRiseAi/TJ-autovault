import { notFound, redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/server';
import { SendMessageModal } from '@/components/messages/send-message-modal';
import { CustomerVehicleManager } from '@/components/workshop/customer-vehicle-manager';
import { RemoveCustomerAccountButton } from '@/components/workshop/remove-customer-account-button';
import { CustomerBillingDetailsForm, type CustomerBillingActionState } from '@/components/workshop/customer-billing-details-form';
import { dispatchRecentCustomerNotifications } from '@/lib/email/dispatch-now';

type CustomerVehicleRow = {
  id: string;
  registration_number: string;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  odometer_km: number | null;
  status: string | null;
  notes: string | null;
  primary_image_path: string | null;
};

type CustomerDetail = {
  id: string;
  name: string;
  linked_email?: string | null;
  billing_name?: string | null;
  billing_company?: string | null;
  billing_address?: string | null;
  billing_email?: string | null;
  billing_phone?: string | null;
  billing_tax_number?: string | null;
  auth_user_id?: string | null;
  onboarding_status?: string | null;
  customer_users?: Array<{
    profile_id?: string;
    profiles?: Array<{
      display_name: string | null;
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
    combined.includes('auth_user_id') ||
    combined.includes('billing_name') ||
    combined.includes('billing_company') ||
    combined.includes('billing_address') ||
    combined.includes('billing_email') ||
    combined.includes('billing_phone') ||
    combined.includes('billing_tax_number')
    combined.includes('billing_tax_number') ||
    combined.includes('auth_user_id')
  );
}


function isMissingCustomerBillingColumnError(
  error: { code?: string; message?: string } | null
) {
  if (!error) return false;
  const combined = `${error.code ?? ''} ${error.message ?? ''}`.toLowerCase();
  return (
    error.code === 'PGRST204' ||
    error.code === '42703' ||
    combined.includes('billing_name') ||
    combined.includes('billing_company') ||
    combined.includes('billing_address') ||
    combined.includes('billing_email') ||
    combined.includes('billing_phone') ||
    combined.includes('billing_tax_number') ||
    combined.includes('auth_user_id')
  );
}

async function loadCustomerVehicles({
  supabase,
  customerAccountId,
  workshopId
}: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  customerAccountId: string;
  workshopId: string;
}): Promise<{ vehicles: CustomerVehicleRow[]; error: string | null }> {
  const withNotes = await supabase
    .from('vehicles')
    .select(
      'id,registration_number,make,model,year,vin,odometer_km,status,notes,primary_image_path'
    )
    .eq('current_customer_account_id', customerAccountId)
    .eq('workshop_account_id', workshopId);

  if (!withNotes.error) {
    return {
      vehicles: (withNotes.data ?? []) as CustomerVehicleRow[],
      error: null
    };
  }

  const missingNotesColumn =
    withNotes.error.code === 'PGRST204' ||
    withNotes.error.code === '42703' ||
    withNotes.error.message.includes("'notes' column") ||
    withNotes.error.message.includes('vehicles.notes') ||
    withNotes.error.message.toLowerCase().includes('notes does not exist');

  if (missingNotesColumn) {
    const withoutNotes = await supabase
      .from('vehicles')
      .select(
        'id,registration_number,make,model,year,vin,odometer_km,status,primary_image_path'
      )
      .eq('current_customer_account_id', customerAccountId)
      .eq('workshop_account_id', workshopId);

    if (!withoutNotes.error) {
      return {
        vehicles: (withoutNotes.data ?? []).map((vehicle) => ({
          ...vehicle,
          notes: null
        })) as CustomerVehicleRow[],
        error: null
      };
    }

    return { vehicles: [], error: withoutNotes.error.message };
  }

  return { vehicles: [], error: withNotes.error.message };
}

export default async function WorkshopCustomerPage({
  params
}: {
  params: Promise<{ customerAccountId: string }>;
}) {
  const { customerAccountId } = await params;
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

  const workshopId = profile.workshop_account_id;

  const customerSelectVariants = [
    'id,name,linked_email,billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number,auth_user_id,onboarding_status,customer_users(profile_id,profiles(display_name,avatar_url))',
    'id,name,linked_email,billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number,onboarding_status,customer_users(profile_id,profiles(display_name,avatar_url))',
    'id,name,linked_email,billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number,auth_user_id,customer_users(profile_id,profiles(display_name,avatar_url))',
    'id,name,linked_email,billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number,customer_users(profile_id,profiles(display_name,avatar_url))',
    'id,name,customer_users(profile_id,profiles(display_name,avatar_url))'
  ];

  let customerQuery: {
    data: unknown;
    error: { code?: string; message?: string } | null;
  } = { data: null, error: null };

  for (const selectClause of customerSelectVariants) {
    const query = await supabase
      .from('customer_accounts')
      .select(selectClause)
      .eq('id', customerAccountId)
      .eq('workshop_account_id', workshopId)
      .single();

    customerQuery = { data: query.data, error: query.error };
    if (!query.error) break;
    if (!isMissingProspectColumnsError(query.error)) break;
  }

  const customerRaw = customerQuery.data as Partial<CustomerDetail> | null;
  const customer = customerRaw
    ? {
        id: customerRaw.id ?? customerAccountId,
        name: customerRaw.name ?? 'Customer',
        linked_email: customerRaw.linked_email ?? null,
        billing_name: customerRaw.billing_name ?? null,
        billing_company: customerRaw.billing_company ?? null,
        billing_address: customerRaw.billing_address ?? null,
        billing_email: customerRaw.billing_email ?? null,
        billing_phone: customerRaw.billing_phone ?? null,
        billing_tax_number: customerRaw.billing_tax_number ?? null,
        auth_user_id: customerRaw.auth_user_id ?? null,
        onboarding_status: customerRaw.onboarding_status ?? null,
        customer_users: customerRaw.customer_users ?? []
      }
    : null;

  const withProspectColumns = await supabase
    .from('customer_accounts')
    .select(
      'id,name,linked_email,billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number,auth_user_id,onboarding_status,customer_users(profile_id,profiles(display_name,avatar_url))'
    )
    .eq('id', customerAccountId)
    .eq('workshop_account_id', workshopId)
    .single();

  let customerQuery = withProspectColumns;

  if (customerQuery.error && isMissingProspectColumnsError(customerQuery.error)) {
    customerQuery = await supabase
      .from('customer_accounts')
      .select(
        'id,name,linked_email,onboarding_status,customer_users(profile_id,profiles(display_name,avatar_url))'
      )
      .eq('id', customerAccountId)
      .eq('workshop_account_id', workshopId)
      .single();
  }

  if (customerQuery.error && isMissingProspectColumnsError(customerQuery.error)) {
    customerQuery = await supabase
      .from('customer_accounts')
      .select('id,name,customer_users(profile_id,profiles(display_name,avatar_url))')
      .eq('id', customerAccountId)
      .eq('workshop_account_id', workshopId)
      .single();
  }

  const customerRaw = customerQuery.data as Partial<CustomerDetail> | null;
  const customer = customerRaw
    ? {
        id: customerRaw.id ?? customerAccountId,
        name: customerRaw.name ?? 'Customer',
        linked_email: customerRaw.linked_email ?? null,
        billing_name: customerRaw.billing_name ?? null,
        billing_company: customerRaw.billing_company ?? null,
        billing_address: customerRaw.billing_address ?? null,
        billing_email: customerRaw.billing_email ?? null,
        billing_phone: customerRaw.billing_phone ?? null,
        billing_tax_number: customerRaw.billing_tax_number ?? null,
        auth_user_id: customerRaw.auth_user_id ?? null,
        onboarding_status: customerRaw.onboarding_status ?? null,
        customer_users: customerRaw.customer_users ?? []
      }
    : null;

  if (!customer) notFound();

  const customerDisplayName =
    customer.customer_users?.[0]?.profiles?.[0]?.display_name || customer.name;


  async function updateCustomerBillingDetails(
    _prevState: CustomerBillingActionState,
    formData: FormData
  ): Promise<CustomerBillingActionState> {
    'use server';

    const supabase = await createClient();
    const user = (await supabase.auth.getUser()).data.user;
    if (!user) return { status: 'error', message: 'Unauthorized' };

    const { data: currentProfile } = await supabase
      .from('profiles')
      .select('role,workshop_account_id')
      .eq('id', user.id)
      .maybeSingle();

    if (
      !currentProfile?.workshop_account_id ||
      (currentProfile.role !== 'admin' && currentProfile.role !== 'technician')
    ) {
      return { status: 'error', message: 'Access denied' };
    }

    const billingName = (formData.get('billing_name')?.toString() ?? '').trim();
    const billingCompany = (formData.get('billing_company')?.toString() ?? '').trim();
    const billingAddress = (formData.get('billing_address')?.toString() ?? '').trim();
    const billingEmail = (formData.get('billing_email')?.toString() ?? '').trim().toLowerCase();
    const billingPhone = (formData.get('billing_phone')?.toString() ?? '').trim();
    const billingTaxNumber = (formData.get('billing_tax_number')?.toString() ?? '').trim();

    if (!billingName && !billingCompany) {
      return { status: 'error', message: 'Billing name or company is required.' };
    }

    const displayName = billingName || billingCompany;

    const fullUpdate = await supabase
      .from('customer_accounts')
      .update({
        name: displayName,
        billing_name: billingName || null,
        billing_company: billingCompany || null,
        billing_address: billingAddress || null,
        billing_email: billingEmail || null,
        billing_phone: billingPhone || null,
        billing_tax_number: billingTaxNumber || null
      })
      .eq('id', customerAccountId)
      .eq('workshop_account_id', currentProfile.workshop_account_id)
      .select('id')
      .maybeSingle();

    const fullUpdateMissingColumns =
      fullUpdate.error && isMissingCustomerBillingColumnError(fullUpdate.error);

    const accountQuery =
      fullUpdateMissingColumns
    const accountQuery =
      fullUpdate.error && isMissingCustomerBillingColumnError(fullUpdate.error)
        ? await supabase
            .from('customer_accounts')
            .update({
              name: displayName,
              billing_address: billingAddress || null
            })
            .eq('id', customerAccountId)
            .eq('workshop_account_id', currentProfile.workshop_account_id)
            .select('id')
            .maybeSingle()
        : fullUpdate;

    const accountFallbackQuery =
      accountQuery.error && isMissingCustomerBillingColumnError(accountQuery.error)
        ? await supabase
            .from('customer_accounts')
            .update({ name: displayName })
            .eq('id', customerAccountId)
            .eq('workshop_account_id', currentProfile.workshop_account_id)
            .select('id')
            .maybeSingle()
        : accountQuery;

    const account = accountFallbackQuery.data;
    if (accountFallbackQuery.error || !account) {
      return {
        status: 'error',
        message:
          accountFallbackQuery.error?.message ??
          'Could not save billing details.'
      };
    }

    if (fullUpdateMissingColumns) {
      return {
        status: 'error',
        message:
          'Could not save all billing fields because your database is missing the latest billing columns. Please run the latest migrations, then try again.'
      };
    }

    await supabase.rpc('push_notification_to_workshop', {
      p_workshop_account_id: currentProfile.workshop_account_id,
      p_kind: 'system',
      p_title: 'Customer billing details updated',
      p_body: `${displayName} billing details were updated by workshop staff.`,
      p_href: `/workshop/customers/${customerAccountId}`,
      p_data: { customer_account_id: customerAccountId }
    });

    const authLookup = await supabase
      .from('customer_accounts')
      .select('auth_user_id')
      .eq('id', customerAccountId)
      .eq('workshop_account_id', currentProfile.workshop_account_id)
      .maybeSingle();

    const hasLinkedAuth =
      !authLookup.error &&
      Boolean(authLookup.data?.auth_user_id);

    if (hasLinkedAuth) {
      const href = '/customer/profile';
      await supabase.rpc('push_notification', {
        p_workshop_account_id: currentProfile.workshop_account_id,
        p_to_customer_account_id: customerAccountId,
        p_kind: 'system',
        p_title: 'Billing details updated',
        p_body: 'Your workshop updated your billing details.',
        p_href: href,
        p_data: { customer_account_id: customerAccountId }
      });

      await dispatchRecentCustomerNotifications({
        customerAccountId,
        kind: 'system',
        href
      });
    }

    return {
      status: 'success',
      message: 'Billing details saved successfully.'
    };
  }

  const [
    { vehicles, error: vehiclesError },
    { count: unpaidInvoices },
    { count: pendingQuotes },
    { count: activeJobs }
  ] = await Promise.all([
    loadCustomerVehicles({ supabase, customerAccountId, workshopId }),
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('customer_account_id', customerAccountId)
      .neq('payment_status', 'paid'),
    supabase
      .from('quotes')
      .select('id', { count: 'exact', head: true })
      .eq('customer_account_id', customerAccountId)
      .in('status', ['sent', 'pending']),
    supabase
      .from('job_cards')
      .select('id', { count: 'exact', head: true })
      .eq('customer_account_id', customerAccountId)
      .eq('workshop_id', workshopId)
      .in('status', [
        'not_started',
        'in_progress',
        'waiting_parts',
        'waiting_approval',
        'quality_check',
        'ready'
      ])
  ]);

  return (
    <main className="space-y-4">
      <PageHeader
        title={customerDisplayName}
        subtitle={`Customer account: ${customer.name}${customer.linked_email ? ` • ${customer.linked_email}` : ''}`}
        actions={
          <div className="flex items-center gap-2">
            <SendMessageModal
              vehicles={vehicles.map((vehicle) => ({
                id: vehicle.id,
                registration_number: vehicle.registration_number
              }))}
              customers={[{ id: customer.id, name: customerDisplayName }]}
              defaultCustomerId={customer.id}
            />
            <RemoveCustomerAccountButton
              customerAccountId={customer.id}
              customerName={customerDisplayName}
            />
          </div>
        }
      />
      <div className="grid gap-3 md:grid-cols-4">
        {[
          ['Vehicles', vehicles.length],
          ['Pending quotes', pendingQuotes ?? 0],
          ['Unpaid invoices', unpaidInvoices ?? 0],
          ['Open requests', activeJobs ?? 0],
          [
            'Portal status',
            customer.onboarding_status === 'active_paid'
              ? 'Paid'
              : customer.onboarding_status === 'registered_unpaid'
                ? 'Registered unpaid'
                : 'Prospect unpaid'
          ]
        ].map(([label, value]) => (
          <Card key={label as string} className="rounded-3xl p-4">
            <p className="text-xs text-gray-500">{label}</p>
            <p className="mt-1 text-2xl font-semibold">{value as number | string}</p>
          </Card>
        ))}
      </div>


      <Card className="rounded-3xl">
        {vehiclesError ? (
          <p className="px-6 pt-6 text-sm text-red-700">
            Could not load linked vehicles: {vehiclesError}
          </p>
        ) : null}
        <CustomerVehicleManager customerAccountId={customer.id} vehicles={vehicles} />
      </Card>


      <Card className="rounded-3xl p-6">
        <details>
          <summary className="cursor-pointer list-none text-base font-semibold [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-2">Billing details <span className="text-xs text-gray-500">(expand)</span></span>
          </summary>
          <p className="mt-2 text-sm text-gray-600">
            Update billing information used on quotes and invoices for this customer.
          </p>
          <div className="mt-4">
            <CustomerBillingDetailsForm
              defaults={{
                billingName: customer.billing_name ?? customer.name,
                billingCompany: customer.billing_company ?? '',
                billingAddress: customer.billing_address ?? '',
                billingEmail: customer.billing_email ?? customer.linked_email ?? '',
                billingPhone: customer.billing_phone ?? '',
                billingTaxNumber: customer.billing_tax_number ?? ''
              }}
              action={updateCustomerBillingDetails}
            />
          </div>
        </details>
      </Card>
    </main>
  );
}
