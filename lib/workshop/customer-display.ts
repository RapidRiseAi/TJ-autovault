import { buildAvatarReadUrl } from '../customer/avatar-upload';

export type WorkshopCustomerProfile = {
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
};

export function getAvatarSrc(avatarUrl: string | null | undefined): string | null {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('/api/uploads/download?')) return avatarUrl;
  if (avatarUrl.startsWith('profiles/')) return buildAvatarReadUrl(avatarUrl);
  return avatarUrl;
}

export function getCustomerDisplayName(profile: WorkshopCustomerProfile | null | undefined, fallbackName: string): string {
  return profile?.full_name || profile?.display_name || fallbackName;
}

export function getInitials(name: string): string {
  return (
    name
      .split(' ')
      .map((part) => part.trim()[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'CU'
  );
}
