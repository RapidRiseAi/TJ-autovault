import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  ALLOWED_AVATAR_MIME_TYPES,
  AVATAR_BUCKET,
  AVATAR_MAX_SIZE_BYTES,
  buildAvatarStoragePath
} from '@/lib/customer/avatar-upload';
import { createClient } from '@/lib/supabase/server';

const avatarSignSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().int().positive()
});

export async function POST(request: NextRequest) {
  const payload = avatarSignSchema.safeParse(await request.json());
  if (!payload.success) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const { fileName, contentType, size } = payload.data;
  if (!ALLOWED_AVATAR_MIME_TYPES.includes(contentType as (typeof ALLOWED_AVATAR_MIME_TYPES)[number])) {
    return NextResponse.json({ error: 'Unsupported avatar format.' }, { status: 400 });
  }

  if (size > AVATAR_MAX_SIZE_BYTES) {
    return NextResponse.json({ error: 'Avatar file is too large. Maximum size is 2 MB.' }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const path = buildAvatarStoragePath(user.id, fileName);
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not create avatar upload URL.' }, { status: 400 });
  }

  const { data: publicUrlData } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  return NextResponse.json({
    bucket: AVATAR_BUCKET,
    path,
    token: data.token,
    publicUrl: publicUrlData.publicUrl
  });
}
