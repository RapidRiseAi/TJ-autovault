import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AVATAR_MAX_SIZE_BYTES,
  buildAvatarStoragePath,
  mapProfileUpdateError,
  validateAvatarFile
} from '../lib/customer/avatar-upload.ts';

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
