import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { SectionCard } from '@/components/ui/section-card';
import {
  WorkshopProfileForm,
  type WorkshopProfileActionState
} from '@/components/workshop/workshop-profile-form';
import { SignaturePanel } from '@/components/workshop/signature-panel';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';


const GB_IN_BYTES = 1024 * 1024 * 1024;

function formatStorage(bytes: number) {
  if (bytes >= GB_IN_BYTES) return `${(bytes / GB_IN_BYTES).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function sanitizeOptionalField(formData: FormData, key: string) {
  const value = formData.get(key)?.toString().trim() ?? '';
  return value || null;
}

async function updateProfile(
  _state: WorkshopProfileActionState,
  formData: FormData
): Promise<WorkshopProfileActionState> {
  'use server';
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const displayName = (formData.get('displayName')?.toString() ?? '').trim();
  const loginEmail = (formData.get('loginEmail')?.toString() ?? '').trim().toLowerCase();

  if (!loginEmail) {
    return {
      status: 'error',
      message: 'Login email is required.'
    };
  }

  if (!displayName) {
    return {
      status: 'error',
      message: 'Display name is required.'
    };
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: displayName })
    .eq('id', user.id);

  if (profileError) {
    return {
      status: 'error',
      message: `Could not save profile: ${profileError.message}`
    };
  }

  const { data: actorProfile, error: actorProfileError } = await supabase
    .from('profiles')
    .select('workshop_account_id,role')
    .eq('id', user.id)
    .maybeSingle();

  if (actorProfileError) {
    return {
      status: 'error',
      message: `Could not load workshop context: ${actorProfileError.message}`
    };
  }

  const currentEmail = (user.email ?? '').trim().toLowerCase();
  const emailChanged = loginEmail !== currentEmail;
  let usedAdminEmailFallback = false;

  if (emailChanged) {
    const { error: authUpdateError } = await supabase.auth.updateUser({
      email: loginEmail
    });

    if (authUpdateError) {
      const invalidCurrentEmail = authUpdateError.message
        .toLowerCase()
        .includes('is invalid');

      if (!invalidCurrentEmail) {
        return {
          status: 'error',
          message: `Profile saved, but login email could not be updated: ${authUpdateError.message}`
        };
      }

      try {
        const admin = createAdminClient();
        usedAdminEmailFallback = true;
        const { error: adminAuthUpdateError } = await admin.auth.admin.updateUserById(
          user.id,
          { email: loginEmail, email_confirm: true }
        );

        if (adminAuthUpdateError) {
          return {
            status: 'error',
            message: `Profile saved, but login email could not be updated: ${adminAuthUpdateError.message}`
          };
        }
      } catch (adminError) {
        return {
          status: 'error',
          message:
            adminError instanceof Error
              ? `Profile saved, but login email could not be updated: ${adminError.message}`
              : 'Profile saved, but login email could not be updated right now.'
        };
      }
    }
  }

  if (actorProfile?.workshop_account_id && actorProfile.role === 'admin') {
    const { error: workshopError } = await supabase
      .from('workshop_accounts')
      .update({
        contact_email: sanitizeOptionalField(formData, 'contactEmail'),
        contact_phone: sanitizeOptionalField(formData, 'contactPhone'),
        website_url: sanitizeOptionalField(formData, 'websiteUrl'),
        booking_url: sanitizeOptionalField(formData, 'bookingUrl'),
        contact_signature: sanitizeOptionalField(formData, 'contactSignature'),
        billing_address: sanitizeOptionalField(formData, 'billingAddress'),
        tax_number: sanitizeOptionalField(formData, 'taxNumber'),
        bank_name: sanitizeOptionalField(formData, 'bankName'),
        bank_account_number: sanitizeOptionalField(formData, 'bankAccountNumber'),
        bank_branch_code: sanitizeOptionalField(formData, 'bankBranchCode'),
        invoice_payment_terms_days: Number(formData.get('invoiceTermsDays') ?? 0) || null,
        quote_validity_days: Number(formData.get('quoteValidityDays') ?? 0) || null,
        invoice_footer: sanitizeOptionalField(formData, 'invoiceFooter')
      })
      .eq('id', actorProfile.workshop_account_id);

    if (workshopError) {
      return {
        status: 'error',
        message: `Could not save workshop contact details: ${workshopError.message}`
      };
    }
  }

  revalidatePath('/workshop/profile');
  revalidatePath('/contact');

  return {
    status: 'success',
    message: emailChanged
      ? usedAdminEmailFallback
        ? 'Workshop profile saved and login email updated.'
        : 'Workshop profile saved. Check your inbox to confirm your new login email.'
      : 'Workshop profile saved.'
  };
}

export default async function WorkshopProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'id,display_name,full_name,avatar_url,workshop_account_id,role,signature_updated_at'
    )
    .eq('id', user.id)
    .maybeSingle();
  const { data: workshop } = profile?.workshop_account_id
    ? await supabase
        .from('workshop_accounts')
        .select(
          'name,contact_email,contact_phone,website_url,booking_url,contact_signature,billing_address,tax_number,bank_name,bank_account_number,bank_branch_code,invoice_payment_terms_days,quote_validity_days,invoice_footer'
        )
        .eq('id', profile.workshop_account_id)
        .maybeSingle()
    : { data: null };

  const [{ data: storageDocs }, { data: workshopCustomers }] = profile?.workshop_account_id
    ? await Promise.all([
        supabase
          .from('vehicle_documents')
          .select('size_bytes,customer_account_id')
          .eq('workshop_account_id', profile.workshop_account_id)
          .limit(10000),
        supabase
          .from('customer_accounts')
          .select('id,onboarding_status')
          .eq('workshop_account_id', profile.workshop_account_id)
          .limit(10000)
      ])
    : [{ data: null }, { data: null }];

  const onboardingByCustomerId = new Map(
    (workshopCustomers ?? []).map((customer) => [
      customer.id,
      customer.onboarding_status ?? 'prospect_unpaid'
    ])
  );

  const storageTotals = (storageDocs ?? []).reduce(
    (totals, document) => {
      const bytes = Number(document.size_bytes ?? 0);
      totals.total += bytes;
      const onboardingStatus = onboardingByCustomerId.get(document.customer_account_id);
      if (onboardingStatus === 'prospect_unpaid') totals.prospect += bytes;
      else totals.registered += bytes;
      return totals;
    },
    { total: 0, registered: 0, prospect: 0 }
  );

  return (
    <main className="space-y-4">
      <PageHeader
        title="Workshop profile"
        subtitle="Manage your workshop account identity."
      />
      <SectionCard className="rounded-3xl p-6">
        <h2 className="text-base font-semibold">Storage usage</h2>
        <p className="mt-1 text-sm text-gray-600">
          Total tracked storage for this workshop across customer documents.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3 text-sm">
          <div className="rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Total usage</p>
            <p className="mt-1 text-lg font-semibold text-black">{formatStorage(storageTotals.total)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Registered customers</p>
            <p className="mt-1 text-lg font-semibold text-black">{formatStorage(storageTotals.registered)}</p>
          </div>
          <div className="rounded-2xl border border-black/10 bg-white p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Prospect customers</p>
            <p className="mt-1 text-lg font-semibold text-black">{formatStorage(storageTotals.prospect)}</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard className="rounded-3xl p-6">
        <WorkshopProfileForm action={updateProfile}>
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              htmlFor="displayName"
            >
              Display name
            </label>
            <input
              id="displayName"
              name="displayName"
              defaultValue={profile?.display_name ?? ''}
              required
              spellCheck
              autoCorrect="on"
              autoCapitalize="words"
              className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm shadow-[0_3px_12px_rgba(0,0,0,0.04)]"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              htmlFor="fullName"
            >
              Full name
            </label>
            <input
              id="fullName"
              value={profile?.full_name ?? ''}
              readOnly
              className="w-full rounded-2xl border border-black/10 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              htmlFor="businessName"
            >
              Business name
            </label>
            <input
              id="businessName"
              value={workshop?.name ?? ''}
              readOnly
              className="w-full rounded-2xl border border-black/10 bg-gray-50 px-4 py-2.5 text-sm text-gray-600"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
              htmlFor="loginEmail"
            >
              Login email
            </label>
            <input
              id="loginEmail"
              name="loginEmail"
              type="email"
              defaultValue={user.email ?? ''}
              required
              spellCheck={false}
              autoCorrect="off"
              autoCapitalize="off"
              className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
            />
          </div>

          {profile?.role === 'admin' ? (
            <>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                  htmlFor="contactEmail"
                >
                  Public contact email
                </label>
                <input
                  id="contactEmail"
                  name="contactEmail"
                  type="email"
                  defaultValue={workshop?.contact_email ?? ''}
                  className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                  placeholder="service@yourworkshop.com"
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                  htmlFor="contactPhone"
                >
                  Public contact phone
                </label>
                <input
                  id="contactPhone"
                  name="contactPhone"
                  defaultValue={workshop?.contact_phone ?? ''}
                  className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                  placeholder="+27 ..."
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                  htmlFor="websiteUrl"
                >
                  Website URL
                </label>
                <input
                  id="websiteUrl"
                  name="websiteUrl"
                  type="url"
                  defaultValue={workshop?.website_url ?? ''}
                  className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div>
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                  htmlFor="bookingUrl"
                >
                  Booking URL
                </label>
                <input
                  id="bookingUrl"
                  name="bookingUrl"
                  type="url"
                  defaultValue={workshop?.booking_url ?? ''}
                  className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                  placeholder="https://..."
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="billingAddress">Billing address</label>
                <textarea id="billingAddress" name="billingAddress" defaultValue={workshop?.billing_address ?? ''} className="min-h-20 w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Street, suburb, city, postal code" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="taxNumber">Tax/VAT number</label>
                <input id="taxNumber" name="taxNumber" defaultValue={workshop?.tax_number ?? ''} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="invoiceTermsDays">Default invoice terms (days)</label>
                <input id="invoiceTermsDays" name="invoiceTermsDays" type="number" min={0} defaultValue={workshop?.invoice_payment_terms_days ?? ''} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="quoteValidityDays">Default quote validity (days)</label>
                <input id="quoteValidityDays" name="quoteValidityDays" type="number" min={0} defaultValue={workshop?.quote_validity_days ?? ''} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="bankName">Bank name</label>
                <input id="bankName" name="bankName" defaultValue={workshop?.bank_name ?? ''} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="bankAccountNumber">Bank account number</label>
                <input id="bankAccountNumber" name="bankAccountNumber" defaultValue={workshop?.bank_account_number ?? ''} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="bankBranchCode">Bank branch code</label>
                <input id="bankBranchCode" name="bankBranchCode" defaultValue={workshop?.bank_branch_code ?? ''} className="w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" />
              </div>
              <div className="md:col-span-2">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500" htmlFor="invoiceFooter">Invoice / quote footer</label>
                <textarea id="invoiceFooter" name="invoiceFooter" defaultValue={workshop?.invoice_footer ?? ''} className="min-h-20 w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm" placeholder="Payment instructions, thank-you note, etc." />
              </div>
              <div className="md:col-span-2">
                <label
                  className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500"
                  htmlFor="contactSignature"
                >
                  Contact signature / sign-off
                </label>
                <textarea
                  id="contactSignature"
                  name="contactSignature"
                  defaultValue={workshop?.contact_signature ?? ''}
                  className="min-h-24 w-full rounded-2xl border border-black/15 bg-white px-4 py-2.5 text-sm"
                  placeholder="e.g. TJ Service Team – Fast, transparent repairs."
                />
              </div>
            </>
          ) : null}

          {(profile?.role === 'technician' || profile?.role === 'admin') &&
          profile.workshop_account_id ? (
            <SignaturePanel
              workshopId={profile.workshop_account_id}
              profileId={profile.id}
              lastUpdatedAt={profile.signature_updated_at}
            />
          ) : null}
        </WorkshopProfileForm>
      </SectionCard>

    </main>
  );
}
