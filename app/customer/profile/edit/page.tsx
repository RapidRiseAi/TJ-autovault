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

    // Fallback for non-JS/no direct browser upload: upload server-side and persist read URL.
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
    const billingAddress = (formData.get('billing_address')?.toString() ?? '').trim();

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name,full_name,phone,preferred_contact_method,billing_name,company_name,billing_address,avatar_url')
    .eq('id', user.id)
    .maybeSingle();

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
            billing_name: profile?.billing_name || '',
            company_name: profile?.company_name || '',
            billing_address: profile?.billing_address || ''
          }}
        />
      </Card>
    </main>
  );
}
