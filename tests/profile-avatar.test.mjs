import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AVATAR_MAX_SIZE_BYTES,
  buildAvatarStoragePath,
  mapProfileUpdateError,
  validateAvatarFile
} from '../lib/customer/avatar-upload.ts';
import { buildProfileUpdatePatch } from '../lib/customer/profile-update.ts';
import { shouldBypassMiddlewareForRequest } from '../lib/auth/middleware-guards.ts';

test('validateAvatarFile rejects oversized avatars with friendly message', () => {
  const message = validateAvatarFile({
    name: 'too-big.png',
    type: 'image/png',
    size: AVATAR_MAX_SIZE_BYTES + 1
  });

  assert.equal(message, 'Avatar file is too large. Maximum size is 2 MB.');
});

test('validateAvatarFile accepts normal-size allowed image type', () => {
  const message = validateAvatarFile({
    name: 'ok.webp',
    type: 'image/webp',
    size: 48 * 1024
  });

  assert.equal(message, null);
});

test('buildAvatarStoragePath creates profile-scoped path', () => {
  const path = buildAvatarStoragePath('user-123', 'avatar.png');

  assert.match(path, /^profiles\/user-123\//);
  assert.match(path, /\.png$/);
});

test('mapProfileUpdateError maps body limit errors to user-facing guidance', () => {
  const message = mapProfileUpdateError(new Error('Body exceeded 1 MB limit'));

  assert.equal(message, 'That avatar is too large to process. Please choose a smaller image (max 2 MB).');
});

test('buildProfileUpdatePatch excludes non-existent avatar_path column and keeps avatar_url', () => {
  const patch = buildProfileUpdatePatch({
    fullName: 'Jane Driver',
    phone: '555-0101',
    preferredContactMethod: 'email',
    billingName: 'Jane Driver',
    companyName: 'Rapid Fleet',
    billingAddress: '123 Test Ave',
    avatarUrl: 'https://cdn.example.com/avatar.webp'
  });

  assert.equal(patch.avatar_url, 'https://cdn.example.com/avatar.webp');
  assert.equal('avatar_path' in patch, false);
});

test('customer profile enhancement migration grants avatar_url updates and does not mention avatar_path', () => {
  const migration = readFileSync('supabase/migrations/202602190001_customer_profile_enhancements.sql', 'utf8');

  assert.match(migration, /grant update \([^)]*avatar_url[^)]*\)/i);
  assert.doesNotMatch(migration, /avatar_path/i);
});

test('middleware bypass helper preserves next-action pass-through behavior', () => {
  assert.equal(shouldBypassMiddlewareForRequest(new Headers({ 'next-action': '1' })), true);
  assert.equal(shouldBypassMiddlewareForRequest(new Headers()), false);
});
