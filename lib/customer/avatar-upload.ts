export const AVATAR_BUCKET = 'profile-avatars';
export const AVATAR_MAX_SIZE_BYTES = 2 * 1024 * 1024;
export const ALLOWED_AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

type AvatarFileLike = {
  size: number;
  type: string;
  name?: string;
};

export function validateAvatarFile(file: AvatarFileLike): string | null {
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])) {
    return 'Please upload a JPG, PNG, or WEBP avatar.';
  }

  if (file.size > AVATAR_MAX_SIZE_BYTES) {
    return 'Avatar file is too large. Maximum size is 2 MB.';
  }

  return null;
}

export function buildAvatarStoragePath(userId: string, fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() || 'jpg';
  return `profiles/${userId}/${Date.now()}-${crypto.randomUUID()}.${extension}`;
}

export function buildAvatarReadUrl(path: string): string {
  return `/api/uploads/download?bucket=${encodeURIComponent(AVATAR_BUCKET)}&path=${encodeURIComponent(path)}`;
}

export function mapProfileUpdateError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');
  if (message.includes('Body exceeded') || message.includes('request entity too large')) {
    return 'That avatar is too large to process. Please choose a smaller image (max 2 MB).';
  }

  return 'We could not save your profile right now. Please try again.';
}
