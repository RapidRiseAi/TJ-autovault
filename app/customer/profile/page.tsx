import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/server';
import { HeroHeader } from '@/components/layout/hero-header';
import { ProfileSettingsForm } from '@/components/customer/profile-settings-form';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_MAX_SIZE_BYTES,
  mapProfileUpdateError,
  validateAvatarFile
} from '@/lib/customer/avatar-upload';

export type ProfileUpdateState = {
  status: 'idle' | 'success' | 'error';
  message: string;
};

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
    if (!fullName) {
      return { status: 'error', message: 'Full name is required.' };
    }

    const phone = (formData.get('phone')?.toString() ?? '').trim();
    const preferredContactMethod = (formData.get('preferred_contact_method')?.toString() ?? 'email').trim();
    const billingName = (formData.get('billing_name')?.toString() ?? '').trim();
    const companyName = (formData.get('company_name')?.toString() ?? '').trim();
    const billingAddress = (formData.get('billing_address')?.toString() ?? '').trim();

    const avatarPath = (formData.get('avatar_path')?.toString() ?? '').trim();
    const avatarUrlFromDirectUpload = (formData.get('avatar_url')?.toString() ?? '').trim();

    // Guardrail: if a file still reaches the action, reject unsupported/oversized uploads clearly.
    const avatar = formData.get('avatar');
    if (typeof File !== 'undefined' && avatar instanceof File && avatar.size > 0) {
      const validationError = validateAvatarFile(avatar);
      if (validationError) {
        return { status: 'error', message: validationError };
      }
    }

    const profilePatch: {
      display_name: string;
      full_name: string;
      phone: string;
      preferred_contact_method: string;
      billing_name: string;
      company_name: string;
      billing_address: string;
      avatar_url?: string;
      avatar_path?: string;
    } = {
      display_name: fullName,
      full_name: fullName,
      phone,
      preferred_contact_method: preferredContactMethod,
      billing_name: billingName,
      company_name: companyName,
      billing_address: billingAddress
    };

    if (avatarUrlFromDirectUpload && avatarPath) {
      profilePatch.avatar_url = avatarUrlFromDirectUpload;
      profilePatch.avatar_path = avatarPath;
    }

    const { error } = await supabase.from('profiles').update(profilePatch).eq('id', user.id);

    if (error) {
      return { status: 'error', message: error.message };
    }

    revalidatePath('/customer/profile');
    return { status: 'success', message: 'Profile saved successfully.' };
  } catch (error) {
    return { status: 'error', message: mapProfileUpdateError(error) };
  }
}

export default async function CustomerProfilePage() {
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

  const { data: customerUser } = await supabase.from('customer_users').select('customer_account_id').eq('profile_id', user.id).maybeSingle();

  const customerAccountId = customerUser?.customer_account_id;

  const [{ data: account }, { count: vehicleCount }] = customerAccountId
    ? await Promise.all([
        supabase.from('customer_accounts').select('tier,vehicle_limit').eq('id', customerAccountId).maybeSingle(),
        supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('current_customer_account_id', customerAccountId)
      ])
    : [{ data: null }, { count: 0 }];

  return (
    <main className="space-y-6">
      <HeroHeader
        title={profile?.full_name || profile?.display_name || 'Customer profile'}
        subtitle={user.email ?? ''}
        media={<img src={profile?.avatar_url || '/favicon.ico'} alt="Profile avatar" className="h-20 w-20 rounded-2xl border border-white/25 object-cover" />}
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
            preferred_contact_method: profile?.preferred_contact_method || 'email',
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
              Plan name: <span className="font-semibold capitalize text-black">{account?.tier ?? 'basic'}</span>
            </p>
            <p>
              Vehicles allowed: <span className="font-semibold text-black">{account?.vehicle_limit ?? 1}</span>
            </p>
            <p>
              Vehicles used: <span className="font-semibold text-black">{vehicleCount ?? 0}</span>
            </p>
          </div>
          <Button asChild size="sm" className="mt-4">
            <Link href="/customer/plan">Manage plan</Link>
          </Button>
        </Card>

        <Card className="rounded-3xl lg:col-span-2">
          <h3 className="text-base font-semibold">Billing</h3>
          <p className="mt-2 text-sm text-gray-600">Billing details are saved in your profile settings form above.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-3 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Billing name</p>
              <p className="font-medium text-black">{profile?.billing_name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Company name</p>
              <p className="font-medium text-black">{profile?.company_name || 'Not set'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-500">Address</p>
              <p className="font-medium text-black">{profile?.billing_address || 'Not set'}</p>
            </div>
          </div>
        </Card>
      </section>

      <Card className="rounded-3xl">
        <h3 className="text-base font-semibold">Security</h3>
        <p className="mt-1 text-sm text-gray-600">Use the account recovery flow if you need to update your password.</p>
        <Button asChild variant="secondary" size="sm" className="mt-3">
          <Link href="/login">Go to sign in and reset password</Link>
        </Button>
      </Card>
    </main>
  );
}
