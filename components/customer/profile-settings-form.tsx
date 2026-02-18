'use client';

import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';

export function ProfileSettingsForm({
  action,
  defaults,
  email
}: {
  action: (formData: FormData) => Promise<void>;
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
}) {
  const [previewUrl, setPreviewUrl] = useState(defaults.avatar_url);

  const avatarPreview = useMemo(
    () => previewUrl || '/favicon.ico',
    [previewUrl]
  );

  return (
    <form action={action} className="space-y-8">
      <section className="grid gap-4 md:grid-cols-[120px_minmax(0,1fr)] md:items-start">
        <img
          src={avatarPreview}
          alt="Profile preview"
          className="h-24 w-24 rounded-2xl border border-black/15 object-cover"
        />
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium" htmlFor="avatar">
              Profile image
            </label>
            <input
              id="avatar"
              name="avatar"
              type="file"
              accept="image/*"
              className="w-full rounded-xl border border-black/15 bg-white px-3 py-2 text-sm"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  setPreviewUrl(URL.createObjectURL(file));
                }
              }}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="full_name"
              >
                Full name
              </label>
              <input
                id="full_name"
                name="full_name"
                defaultValue={defaults.full_name}
                required
                className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="phone">
                Phone
              </label>
              <input
                id="phone"
                name="phone"
                defaultValue={defaults.phone}
                className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label
                className="mb-1 block text-sm font-medium"
                htmlFor="preferred_contact_method"
              >
                Preferred contact method
              </label>
              <select
                id="preferred_contact_method"
                name="preferred_contact_method"
                defaultValue={defaults.preferred_contact_method}
                className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
              >
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="sms">SMS</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                value={email}
                readOnly
                className="w-full rounded-xl border border-black/10 bg-gray-100 px-3 py-2 text-sm text-gray-600"
              />
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="billing_name"
          >
            Billing name
          </label>
          <input
            id="billing_name"
            name="billing_name"
            defaultValue={defaults.billing_name}
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="company_name"
          >
            Company name
          </label>
          <input
            id="company_name"
            name="company_name"
            defaultValue={defaults.company_name}
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </div>
        <div className="sm:col-span-2">
          <label
            className="mb-1 block text-sm font-medium"
            htmlFor="billing_address"
          >
            Address
          </label>
          <textarea
            id="billing_address"
            name="billing_address"
            defaultValue={defaults.billing_address}
            rows={3}
            className="w-full rounded-xl border border-black/15 px-3 py-2 text-sm"
          />
        </div>
      </section>

      <Button type="submit">Save profile settings</Button>
    </form>
  );
}
