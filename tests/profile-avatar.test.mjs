import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  AVATAR_BUCKET,
  AVATAR_MAX_SIZE_BYTES,
  buildAvatarReadUrl,
  buildAvatarStoragePath,
  mapProfileUpdateError,
  validateAvatarFile
} from '../lib/customer/avatar-upload.ts';
import { buildProfileUpdatePatch } from '../lib/customer/profile-update.ts';
import { shouldBypassMiddlewareForRequest } from '../lib/auth/middleware-guards.ts';
import { canAccessProfileAvatar, extractAvatarOwnerId } from '../lib/uploads/avatar-access.ts';
import { selectBestCustomerProfile } from '../lib/workshop/customer-profile-selection.ts';

function createMockSupabase({ actorProfile, customerMemberships = [], linkedAccount = null }) {
  return {
    from(table) {
      const query = {
        _table: table,
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        limit() {
          return this;
        },
        maybeSingle: async function () {
          if (this._table === 'profiles') return { data: actorProfile };
          if (this._table === 'customer_accounts') return { data: linkedAccount };
          return { data: null };
        },
        then(resolve) {
          if (this._table === 'customer_users') {
            return Promise.resolve(resolve({ data: customerMemberships }));
          }
          return Promise.resolve(resolve({ data: null }));
        }
      };

      return query;
    }
  };
}

test('avatar uploads use the dedicated private profile bucket', () => {
  assert.equal(AVATAR_BUCKET, 'profile-avatars');
});

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

test('buildAvatarReadUrl points to authenticated download endpoint', () => {
  const url = buildAvatarReadUrl('profiles/00000000-0000-0000-0000-000000000000/avatar.png');

  assert.match(url, /^\/api\/uploads\/download\?/);
  assert.match(url, /bucket=profile-avatars/);
  assert.match(url, /path=profiles%2F00000000-0000-0000-0000-000000000000%2Favatar\.png/);
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

test('profile avatar bucket migration defines dedicated bucket and auth.uid ownership policies', () => {
  const migration = readFileSync('supabase/migrations/202602190002_profile_avatar_bucket_rls.sql', 'utf8');

  assert.match(migration, /insert into storage\.buckets[\s\S]*'profile-avatars'/i);
  assert.match(migration, /create policy "profile avatars self upload"[\s\S]*for insert[\s\S]*bucket_id = 'profile-avatars'/i);
  assert.match(migration, /create policy "profile avatars self upload"[\s\S]*split_part\(name, '\/', 1\) = 'profiles'/i);
  assert.match(migration, /create policy "profile avatars self upload"[\s\S]*split_part\(name, '\/', 2\)::uuid = auth\.uid\(\)/i);
  assert.match(migration, /create policy "profile avatars self read"[\s\S]*for select[\s\S]*bucket_id = 'profile-avatars'/i);
  assert.match(migration, /create policy "profile avatars self read"[\s\S]*split_part\(name, '\/', 2\)::uuid = auth\.uid\(\)/i);
});

test('new avatar workshop migration grants linked workshop read access with constrained bucket/path rules', () => {
  const migration = readFileSync('supabase/migrations/202602190003_profile_avatar_workshop_read.sql', 'utf8');

  assert.match(migration, /create policy "profile avatars workshop linked read"/i);
  assert.match(migration, /bucket_id = 'profile-avatars'/i);
  assert.match(migration, /split_part\(name, '\/', 1\) = 'profiles'/i);
  assert.match(migration, /split_part\(name, '\/', 2\)::uuid/i);
  assert.match(migration, /customer_users/i);
  assert.match(migration, /customer_accounts/i);
  assert.match(migration, /actor\.role in \('admin', 'technician'\)/i);
});

test('route avatar authorization allows owner and linked workshop staff, denies unrelated user', async () => {
  const ownerAllowed = await canAccessProfileAvatar(createMockSupabase({}), 'owner-id', 'owner-id');
  assert.equal(ownerAllowed, true);

  const staffAllowed = await canAccessProfileAvatar(
    createMockSupabase({
      actorProfile: { role: 'admin', workshop_account_id: 'workshop-1' },
      customerMemberships: [{ customer_account_id: 'customer-1' }],
      linkedAccount: { id: 'customer-1' }
    }),
    'staff-id',
    'customer-profile-id'
  );
  assert.equal(staffAllowed, true);

  const unrelatedDenied = await canAccessProfileAvatar(
    createMockSupabase({
      actorProfile: { role: 'admin', workshop_account_id: 'workshop-1' },
      customerMemberships: [{ customer_account_id: 'customer-2' }],
      linkedAccount: null
    }),
    'staff-id',
    'customer-profile-id'
  );
  assert.equal(unrelatedDenied, false);
});


test('selectBestCustomerProfile prefers avatar_url over other profile fields', () => {
  const selected = selectBestCustomerProfile([
    { profiles: [{ full_name: 'Alex Name', display_name: 'Alex', avatar_url: null }] },
    { profiles: [{ full_name: null, display_name: 'A Driver', avatar_url: 'profiles/user-1/avatar.png' }] }
  ]);

  assert.equal(selected?.avatar_url, 'profiles/user-1/avatar.png');
});

test('selectBestCustomerProfile falls back to full_name then display_name', () => {
  const fullNameSelected = selectBestCustomerProfile([
    { profiles: [{ full_name: null, display_name: null, avatar_url: null }] },
    { profiles: [{ full_name: 'Morgan Full', display_name: null, avatar_url: null }] },
    { profiles: [{ full_name: null, display_name: 'Morgan Display', avatar_url: null }] }
  ]);
  assert.equal(fullNameSelected?.full_name, 'Morgan Full');

  const displayNameSelected = selectBestCustomerProfile([
    { profiles: [{ full_name: null, display_name: '', avatar_url: null }] },
    { profiles: [{ full_name: null, display_name: 'Only Display', avatar_url: null }] }
  ]);
  assert.equal(displayNameSelected?.display_name, 'Only Display');
});

test('workshop customer pages render image when avatar exists and fallback initials when absent', () => {
  const dashboardPage = readFileSync('app/workshop/dashboard/page.tsx', 'utf8');
  const customersPage = readFileSync('app/workshop/customers/page.tsx', 'utf8');

  assert.match(dashboardPage, /const profileInfo = selectBestCustomerProfile\(customer\.customer_users\);/);
  assert.match(dashboardPage, /const avatar = getAvatarSrc\(profileInfo\?\.avatar_url\)/);
  assert.match(dashboardPage, /\{avatar \? \(/);
  assert.match(dashboardPage, /<img src=\{avatar\}/);
  assert.match(dashboardPage, /getInitials\(customerName\)/);

  assert.match(customersPage, /const customerProfile = selectBestCustomerProfile\(customer\.customer_users\);/);
  assert.match(customersPage, /const avatar = getAvatarSrc\(customerProfile\?\.avatar_url\)/);
  assert.match(customersPage, /\{avatar \? <img src=\{avatar\}/);
  assert.match(customersPage, /getInitials\(customerName\)/);
});

test('extractAvatarOwnerId enforces profiles prefix', () => {
  assert.equal(extractAvatarOwnerId('profiles/user-1/avatar.png'), 'user-1');
  assert.equal(extractAvatarOwnerId('other/user-1/avatar.png'), null);
});

test('middleware bypass helper preserves next-action pass-through behavior', () => {
  assert.equal(shouldBypassMiddlewareForRequest(new Headers({ 'next-action': '1' })), true);
  assert.equal(shouldBypassMiddlewareForRequest(new Headers()), false);
});
