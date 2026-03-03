import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { HeroHeader } from '@/components/layout/hero-header';
import { ProfileSettingsForm } from '@/components/customer/profile-settings-form';
import { RemoveCustomerAccountButton } from '@/components/customer/remove-customer-account-button';
import type { ProfileUpdateState } from '@/lib/customer/profile-types';
import { buildProfileUpdatePatch } from '@/lib/customer/profile-update';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_MAX_SIZE_BYTES,
  mapProfileUpdateError,
  validateAvatarFile
} from '@/lib/customer/avatar-upload';

const GB_IN_BYTES = 1024 * 1024 * 1024;
const EXTRA_STORAGE_PRICE_CENTS_PER_GB = 2000;

function formatStorage(bytes: number) {
  if (bytes >= GB_IN_BYTES) return `${(bytes / GB_IN_BYTES).toFixed(2)} GB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

const initialProfileUpdateState: ProfileUpdateState = {
  status: 'idle',
  message: ''
};

async function updateProfile(
  _previousState: ProfileUpdateState,
  formData: FormData
): Promise<ProfileUpdateState> {
  'use server';

  try {
    const supabase = await createClient();
    const {
      data: { user }
    } = await supabase.auth.getUser();

    if (!user) redirect('/login');

    const fullName = (formData.get('full_name')?.toString() ?? '').trim();
    const loginEmail = (formData.get('login_email')?.toString() ?? '').trim().toLowerCase();

    if (!loginEmail) {
      return { status: 'error', message: 'Email is required.' };
    }

    if (!fullName) {
      return { status: 'error', message: 'Full name is required.' };
    }

    const phone = (formData.get('phone')?.toString() ?? '').trim();
    const preferredContactMethod = (
      formData.get('preferred_contact_method')?.toString() ?? 'email'
    ).trim();
    const billingName = (formData.get('billing_name')?.toString() ?? '').trim();
    const companyName = (formData.get('company_name')?.toString() ?? '').trim();
    const billingAddress = (
      formData.get('billing_address')?.toString() ?? ''
    ).trim();

    const avatarUrlFromDirectUpload = (
      formData.get('avatar_url')?.toString() ?? ''
    ).trim();

    // Guardrail: if a file still reaches the action, reject unsupported/oversized uploads clearly.
    const avatar = formData.get('avatar');
    if (
      typeof File !== 'undefined' &&
      avatar instanceof File &&
      avatar.size > 0
    ) {
      const validationError = validateAvatarFile(avatar);
      if (validationError) {
        return { status: 'error', message: validationError };
      }
    }

    const profilePatch = buildProfileUpdatePatch({
      fullName,
      phone,
      preferredContactMethod,
      billingName,
      companyName,
      billingAddress,
      avatarUrl: avatarUrlFromDirectUpload || undefined
    });

    const { error } = await supabase
      .from('profiles')
      .update(profilePatch)
      .eq('id', user.id);

    if (error) {
      return { status: 'error', message: error.message };
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
            message: `Profile saved, but email could not be updated: ${authUpdateError.message}`
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
              message: `Profile saved, but email could not be updated: ${adminAuthUpdateError.message}`
            };
          }
        } catch (adminError) {
          return {
            status: 'error',
            message:
              adminError instanceof Error
                ? `Profile saved, but email could not be updated: ${adminError.message}`
                : 'Profile saved, but email could not be updated right now.'
          };
        }
      }
    }

    revalidatePath('/customer/profile');
    return {
      status: 'success',
      message: emailChanged
        ? usedAdminEmailFallback
          ? 'Profile saved and login email updated.'
          : 'Profile saved. Check your inbox to confirm the new login email.'
        : 'Profile saved successfully.'
    };
  } catch (error) {
    return { status: 'error', message: mapProfileUpdateError(error) };
  }
}

async function addStorage(formData: FormData) {
  'use server';

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const requestedGb = Number(formData.get('add_storage_gb')?.toString() ?? '0');
  const roundedGb = Math.floor(requestedGb);
  if (!Number.isFinite(roundedGb) || roundedGb <= 0) {
    return;
  }

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  if (!customerUser?.customer_account_id) return;

  const { data: account } = await supabase
    .from('customer_accounts')
    .select('extra_storage_gb,plan_price_cents')
    .eq('id', customerUser.customer_account_id)
    .maybeSingle();

  await supabase
    .from('customer_accounts')
    .update({
      extra_storage_gb: (account?.extra_storage_gb ?? 0) + roundedGb,
      plan_price_cents:
        (account?.plan_price_cents ?? 0) +
        roundedGb * EXTRA_STORAGE_PRICE_CENTS_PER_GB
    })
    .eq('id', customerUser.customer_account_id);

  revalidatePath('/customer/profile');
  revalidatePath('/customer/plan');
}

export default async function CustomerProfilePage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'display_name,full_name,phone,preferred_contact_method,billing_name,company_name,billing_address,avatar_url'
    )
    .eq('id', user.id)
    .maybeSingle();

  const { data: customerUser } = await supabase
    .from('customer_users')
    .select('customer_account_id')
    .eq('profile_id', user.id)
    .maybeSingle();

  const customerAccountId = customerUser?.customer_account_id;

  const [{ data: account }, { count: vehicleCount }, { data: storageDocs }] = customerAccountId
    ? await Promise.all([
        supabase
          .from('customer_accounts')
          .select('tier,vehicle_limit,included_storage_bytes,extra_storage_gb,plan_price_cents')
          .eq('id', customerAccountId)
          .maybeSingle(),
        supabase
          .from('vehicles')
          .select('id', { count: 'exact', head: true })
          .eq('current_customer_account_id', customerAccountId),
        supabase
          .from('vehicle_documents')
          .select('size_bytes')
          .eq('customer_account_id', customerAccountId)
          .limit(5000)
      ])
    : [{ data: null }, { count: 0 }, { data: null }];

  const storageUsedBytes = (storageDocs ?? []).reduce(
    (sum, item) => sum + Number(item.size_bytes ?? 0),
    0
  );
  const includedBytes = Number(account?.included_storage_bytes ?? 0);
  const extraBytes = Number(account?.extra_storage_gb ?? 0) * GB_IN_BYTES;
  const storageLimitBytes = includedBytes + extraBytes;
  const usagePercent = storageLimitBytes > 0 ? (storageUsedBytes / storageLimitBytes) * 100 : 0;
  const isStorageLow = usagePercent >= 90;

  return (
    <main className="space-y-6">
      <HeroHeader
        title={
          profile?.full_name || profile?.display_name || 'Customer profile'
        }
        subtitle={user.email ?? ''}
        media={
          <img
            src={profile?.avatar_url || '/favicon.ico'}
            alt="Profile avatar"
            className="h-20 w-20 rounded-2xl border border-white/25 object-cover"
          />
        }
      />

      <Card className="rounded-3xl">
        <h2 className="mb-4 text-lg font-semibold">Profile settings</h2>
        <ProfileSettingsForm
          action={updateProfile}
          initialState={initialProfileUpdateState}
          email={user.email ?? ''}
          avatarRules={{
            maxSizeBytes: AVATAR_MAX_SIZE_BYTES,
            allowedMimeTypes: [...ALLOWED_AVATAR_MIME_TYPES]
          }}
          defaults={{
            full_name: profile?.full_name || profile?.display_name || '',
            phone: profile?.phone || '',
            preferred_contact_method:
              profile?.preferred_contact_method || 'email',
            avatar_url: profile?.avatar_url || '',
            billing_name: profile?.billing_name || '',
            company_name: profile?.company_name || '',
            billing_address: profile?.billing_address || ''
          }}
        />
      </Card>

      <section className="grid gap-4 lg:grid-cols-3">
        <Card className="rounded-3xl">
          <h3 className="text-base font-semibold">Plan</h3>
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>
              Plan name:{' '}
              <span className="font-semibold capitalize text-black">
                {account?.tier ?? 'basic'}
              </span>
            </p>
            <p>
              Vehicles allowed:{' '}
              <span className="font-semibold text-black">
                {account?.vehicle_limit ?? 1}
              </span>
            </p>
            <p>
              Vehicles used:{' '}
              <span className="font-semibold text-black">
                {vehicleCount ?? 0}
              </span>
            </p>
            <p>
              Storage used:{' '}
              <span className="font-semibold text-black">
                {formatStorage(storageUsedBytes)} / {formatStorage(storageLimitBytes)}
              </span>
            </p>
            <p>
              Usage:{' '}
              <span className={`font-semibold ${isStorageLow ? 'text-red-600' : 'text-black'}`}>
                {usagePercent.toFixed(1)}%
              </span>
            </p>
            {isStorageLow ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                You have reached 90% of your storage limit. Please upgrade your plan or add storage.
              </p>
            ) : null}
            <form action={addStorage} className="space-y-2 rounded-xl border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Add storage</p>
              <p className="text-xs text-gray-600">R20 PM per extra GB</p>
              <div className="flex items-center gap-2">
                <input
                  name="add_storage_gb"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={1}
                  className="w-24 rounded-lg border border-gray-300 px-2 py-1 text-sm"
                />
                <Button type="submit" size="sm" variant="secondary">
                  Add GB
                </Button>
              </div>
              <p className="text-xs text-gray-600">
                Extra storage active: {account?.extra_storage_gb ?? 0} GB · Extra monthly: R
                {(((account?.extra_storage_gb ?? 0) * EXTRA_STORAGE_PRICE_CENTS_PER_GB) / 100).toFixed(2)}
              </p>
              <p className="text-xs text-gray-600">
                Estimated total plan price: R{((account?.plan_price_cents ?? 0) / 100).toFixed(2)} / month
              </p>
            </form>
          </div>
          <Button asChild size="sm" className="mt-4">
            <Link href="/customer/plan">Manage plan</Link>
          </Button>
        </Card>

        <Card className="rounded-3xl lg:col-span-2">
          <h3 className="text-base font-semibold">Billing</h3>
          <p className="mt-2 text-sm text-gray-600">
            Billing details are saved in your profile settings form above.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Billing name
              </p>
              <p className="font-medium text-black">
                {profile?.billing_name || 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Company name
              </p>
              <p className="font-medium text-black">
                {profile?.company_name || 'Not set'}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Address
              </p>
              <p className="font-medium text-black">
                {profile?.billing_address || 'Not set'}
              </p>
            </div>
          </div>
        </Card>
      </section>

      <Card className="rounded-3xl border-red-200">
        <h3 className="text-base font-semibold text-red-700">Danger zone</h3>
        <p className="mt-1 text-sm text-gray-600">
          Remove this customer account from your workshop and customer portal.
        </p>
        <div className="mt-3">
          <RemoveCustomerAccountButton />
        </div>
      </Card>

      <Card className="rounded-3xl">
        <h3 className="text-base font-semibold">Security</h3>
        <p className="mt-1 text-sm text-gray-600">
          Use the account recovery flow if you need to update your password.
        </p>
        <Button asChild variant="secondary" size="sm" className="mt-3">
          <Link href="/login">Go to sign in and reset password</Link>
        </Button>
      </Card>
    </main>
  );
}
