export type ProfileUpdateInput = {
  fullName: string;
  phone: string;
  preferredContactMethod: string;
  billingName: string;
  companyName: string;
  billingAddress: string;
  avatarUrl?: string;
};

export type ProfileUpdatePatch = {
  display_name: string;
  full_name: string;
  phone: string;
  preferred_contact_method: string;
  billing_name: string;
  company_name: string;
  billing_address: string;
  avatar_url?: string;
};

export function buildProfileUpdatePatch(input: ProfileUpdateInput): ProfileUpdatePatch {
  const patch: ProfileUpdatePatch = {
    display_name: input.fullName,
    full_name: input.fullName,
    phone: input.phone,
    preferred_contact_method: input.preferredContactMethod,
    billing_name: input.billingName,
    company_name: input.companyName,
    billing_address: input.billingAddress
  };

  if (input.avatarUrl) {
    patch.avatar_url = input.avatarUrl;
  }

  return patch;
}
