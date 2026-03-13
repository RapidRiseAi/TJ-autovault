import Link from 'next/link';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ProfileSettingsForm } from '@/components/customer/profile-settings-form';
import { createClient } from '@/lib/supabase/server';
import type { ProfileUpdateState } from '@/lib/customer/profile-types';
import { buildProfileUpdatePatch } from '@/lib/customer/profile-update';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_BUCKET,
  AVATAR_MAX_SIZE_BYTES,
  buildAvatarReadUrl,
  buildAvatarStoragePath,
  mapProfileUpdateError,
  validateAvatarFile
} from '@/lib/customer/avatar-upload';
import { composeBillingAddress, splitBillingAddress } from '@/lib/customer/billing-address';

const initialProfileUpdateState: ProfileUpdateState = { status: 'idle', message: '' };

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
    if (!loginEmail) return { status: 'error', message: 'Email is required.' };

    const avatarUrlFromSignedUpload = (formData.get('avatar_url')?.toString() ?? '').trim();

    const avatarFileInput = formData.get('avatar') ?? formData.get('avatar_file');
    const avatarFile = avatarFileInput instanceof File && avatarFileInput.size > 0
      ? avatarFileInput
      : null;

    let avatarUrlToSave = avatarUrlFromSignedUpload || '';

    if (!avatarUrlToSave && avatarFile) {
      const avatarValidationError = validateAvatarFile(avatarFile);
      if (avatarValidationError) {
        return { status: 'error', message: avatarValidationError };
      }

      const path = buildAvatarStoragePath(user.id, avatarFile.name);
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, avatarFile, { upsert: true, contentType: avatarFile.type || 'image/jpeg' });

      if (uploadError) return { status: 'error', message: uploadError.message };
      avatarUrlToSave = buildAvatarReadUrl(path);
    }

    const phone = (formData.get('phone')?.toString() ?? '').trim();
    const preferredContactMethod =
      (formData.get('preferred_contact_method')?.toString() as 'email' | 'phone' | 'whatsapp') ??
      'email';
    const billingName = (formData.get('billing_name')?.toString() ?? '').trim();
    const companyName = (formData.get('company_name')?.toString() ?? '').trim();
    const billingEmail = (formData.get('billing_email')?.toString() ?? '').trim().toLowerCase();
    const billingPhone = (formData.get('billing_phone')?.toString() ?? '').trim();
    const billingTaxNumber = (formData.get('billing_tax_number')?.toString() ?? '').trim();
    const billingAddress = composeBillingAddress({
      street: (formData.get('billing_address_street')?.toString() ?? '').trim(),
      city: (formData.get('billing_address_city')?.toString() ?? '').trim(),
      province: (formData.get('billing_address_province')?.toString() ?? '').trim(),
      postalCode: (formData.get('billing_address_postal_code')?.toString() ?? '').trim()
    });

    const profilePatch = buildProfileUpdatePatch({
      fullName,
      phone,
      preferredContactMethod,
      billingName,
      companyName,
      billingAddress,
      avatarUrl: avatarUrlToSave || undefined
    });

    const { error } = await supabase.from('profiles').update(profilePatch).eq('id', user.id);
    if (error) return { status: 'error', message: error.message };

    const { data: membership } = await supabase
      .from('customer_users')
      .select('customer_account_id')
      .eq('profile_id', user.id)
      .maybeSingle();

    const customerAccountId = membership?.customer_account_id;
    if (customerAccountId) {
      const { error: accountError } = await supabase
        .from('customer_accounts')
        .update({
          billing_name: billingName || null,
          billing_company: companyName || null,
          billing_address: billingAddress || null,
          billing_email: billingEmail || null,
          billing_phone: billingPhone || null,
          billing_tax_number: billingTaxNumber || null
        })
        .eq('id', customerAccountId)
        .eq('auth_user_id', user.id);

      if (accountError) return { status: 'error', message: accountError.message };
    }

    const currentEmail = (user.email ?? '').trim().toLowerCase();
    if (loginEmail !== currentEmail) {
      const { error: authUpdateError } = await supabase.auth.updateUser({ email: loginEmail });
      if (authUpdateError) {
        return {
          status: 'error',
          message: `Profile saved, but email could not be updated: ${authUpdateError.message}`
        };
      }
    }

    revalidatePath('/customer/profile');
    revalidatePath('/customer/profile/edit');
    revalidatePath('/customer/profile/billing');
    revalidatePath('/customer/dashboard');
    return { status: 'success', message: 'Profile saved successfully.' };
  } catch (error) {
    return { status: 'error', message: mapProfileUpdateError(error) };
  }
}

export default async function CustomerProfileEditPage() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name,full_name,phone,preferred_contact_method,billing_name,company_name,billing_address,avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('customer_users')
      .select('customer_account_id')
      .eq('profile_id', user.id)
      .maybeSingle()
  ]);

  const customerAccountId = membership?.customer_account_id ?? null;
  const { data: accountBilling } = customerAccountId
    ? await supabase
        .from('customer_accounts')
        .select('billing_name,billing_company,billing_address,billing_email,billing_phone,billing_tax_number')
        .eq('id', customerAccountId)
        .maybeSingle()
    : { data: null };

  const billingAddressDefaults = splitBillingAddress(
    accountBilling?.billing_address ?? profile?.billing_address ?? ''
  );

  return (
    <main className="space-y-4">
      <PageHeader
        title="Profile edit"
        subtitle="Update your name, contact details, avatar, and billing info."
        actions={<Button asChild variant="secondary"><Link href="/customer/profile">Back to settings</Link></Button>}
      />
      <Card className="rounded-3xl">
        <ProfileSettingsForm
          action={updateProfile}
          initialState={initialProfileUpdateState}
          email={user.email ?? ''}
          avatarRules={{ maxSizeBytes: AVATAR_MAX_SIZE_BYTES, allowedMimeTypes: [...ALLOWED_AVATAR_MIME_TYPES] }}
          defaults={{
            full_name: profile?.full_name || profile?.display_name || '',
            phone: profile?.phone || '',
            preferred_contact_method: profile?.preferred_contact_method || 'email',
            avatar_url: profile?.avatar_url || '',
            billing_name: accountBilling?.billing_name || profile?.billing_name || '',
            company_name: accountBilling?.billing_company || profile?.company_name || '',
            billing_email: accountBilling?.billing_email || '',
            billing_phone: accountBilling?.billing_phone || '',
            billing_tax_number: accountBilling?.billing_tax_number || '',
            billing_address_street: billingAddressDefaults.street,
            billing_address_city: billingAddressDefaults.city,
            billing_address_province: billingAddressDefaults.province,
            billing_address_postal_code: billingAddressDefaults.postalCode
          }}
        />
      </Card>
    </main>
  );
}
