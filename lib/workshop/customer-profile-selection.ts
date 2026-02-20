export type WorkshopCustomerProfile = {
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export type WorkshopCustomerUser = {
  profiles?: WorkshopCustomerProfile[];
};

function hasValue(value: string | null | undefined): boolean {
  return Boolean(value?.trim());
}

export function selectBestCustomerProfile(customerUsers: WorkshopCustomerUser[] | null | undefined): WorkshopCustomerProfile | null {
  const profiles = (customerUsers ?? []).flatMap((customerUser) => customerUser.profiles ?? []);
  if (!profiles.length) return null;

  const withAvatar = profiles.find((profile) => hasValue(profile.avatar_url));
  if (withAvatar) return withAvatar;

  const withFullName = profiles.find((profile) => hasValue(profile.full_name));
  if (withFullName) return withFullName;

  const withDisplayName = profiles.find((profile) => hasValue(profile.display_name));
  if (withDisplayName) return withDisplayName;

  return profiles[0] ?? null;
}
