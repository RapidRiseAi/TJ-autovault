'use client';

import { useActionState, useMemo, useState } from 'react';
import { useFormStatus } from 'react-dom';
import type { ProfileUpdateState } from '@/lib/customer/profile-types';
import { createClient as createBrowserSupabaseClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';

type AvatarRules = {
  maxSizeBytes: number;
  allowedMimeTypes: string[];
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? 'Saving…' : 'Save profile settings'}
    </Button>
  );
}

export function ProfileSettingsForm({
  action,
  initialState,
  defaults,
  email,
  avatarRules
}: {
  action: (state: ProfileUpdateState, formData: FormData) => Promise<ProfileUpdateState>;
  initialState: ProfileUpdateState;
  defaults: {
    full_name: string;
    phone: string;
    preferred_contact_method: string;
    avatar_url: string;
    billing_name: string;
    company_name: string;
    billing_address: string;
  };
  email: string;
  avatarRules: AvatarRules;
}) {
  const [previewUrl, setPreviewUrl] = useState(defaults.avatar_url);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [uploadedAvatarUrl, setUploadedAvatarUrl] = useState('');

  const [state, formAction] = useActionState(action, initialState);

  const avatarPreview = useMemo(() => previewUrl || '/favicon.ico', [previewUrl]);

  const onAvatarChange = (file?: File) => {
    if (!file) {
      setAvatarError(null);
      return;
    }

    if (!avatarRules.allowedMimeTypes.includes(file.type)) {
      setAvatarError('Please upload a JPG, PNG, or WEBP avatar.');
      return;
    }

    if (file.size > avatarRules.maxSizeBytes) {
      setAvatarError('Avatar file is too large. Maximum size is 2 MB.');
      return;
    }

    setAvatarError(null);
    setPreviewUrl(URL.createObjectURL(file));
  };

  return (
    <form
      action={async (formData) => {
        if (avatarError) return;

        const file = formData.get('avatar');
        const shouldUploadAvatar = typeof File !== 'undefined' && file instanceof File && file.size > 0;

        if (shouldUploadAvatar) {
          if (!avatarRules.allowedMimeTypes.includes(file.type)) {
            setAvatarError('Please upload a JPG, PNG, or WEBP avatar.');
            return;
          }

          if (file.size > avatarRules.maxSizeBytes) {
            setAvatarError('Avatar file is too large. Maximum size is 2 MB.');
            return;
          }

          const response = await fetch('/api/customer/profile/avatar/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              fileName: file.name,
              contentType: file.type,
              size: file.size
            })
          });

          const signPayload = await response.json();
          if (!response.ok) {
            setAvatarError(signPayload.error ?? 'Could not prepare avatar upload.');
            return;
          }

          // Upload directly from browser to Storage, then send only metadata to the server action.
          const supabase = createBrowserSupabaseClient();
          const { error } = await supabase.storage.from(signPayload.bucket).uploadToSignedUrl(signPayload.path, signPayload.token, file);
          if (error) {
            setAvatarError(error.message || 'Avatar upload failed. Please try again.');
            return;
          }

          setUploadedAvatarUrl(signPayload.publicUrl);
          formData.set('avatar_url', signPayload.publicUrl);

          // Prevent the raw file from being part of the server action payload.
          formData.delete('avatar');
        }

        await formAction(formData);
      }}
      className="space-y-8"
    >
      <input type="hidden" name="avatar_url" value={uploadedAvatarUrl} />

      <section className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)] md:items-start">
        <img src={avatarPreview} alt="Profile preview" className="h-24 w-24 rounded-2xl border border-black/15 object-cover" />
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="avatar">
              Profile image
            </label>
            <input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
              onChange={(event) => onAvatarChange(event.target.files?.[0])}
            />
            {avatarError ? <p className="mt-2 text-sm text-red-600">{avatarError}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="full_name">
                Full name
              </label>
              <input id="full_name" name="full_name" defaultValue={defaults.full_name} required className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="phone">
                Phone
              </label>
              <input id="phone" name="phone" defaultValue={defaults.phone} className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="preferred_contact_method">
                Preferred contact method
              </label>
              <select id="preferred_contact_method" name="preferred_contact_method" defaultValue={defaults.preferred_contact_method} className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm">
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input id="email" value={email} readOnly className="w-full rounded-xl border border-black/10 bg-gray-100 px-3 py-2 text-sm text-gray-600" />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="billing_name">
            Billing name
          </label>
          <input id="billing_name" name="billing_name" defaultValue={defaults.billing_name} className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium" htmlFor="company_name">
            Company name
          </label>
          <input id="company_name" name="company_name" defaultValue={defaults.company_name} className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="mb-1 block text-sm font-medium" htmlFor="billing_address">
            Address
          </label>
          <textarea id="billing_address" name="billing_address" defaultValue={defaults.billing_address} rows={3} className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm" />
        </div>
      </section>

      {state.status !== 'idle' ? (
        <p className={state.status === 'error' ? 'text-sm text-red-600' : 'text-sm text-emerald-700'}>{state.message}</p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
