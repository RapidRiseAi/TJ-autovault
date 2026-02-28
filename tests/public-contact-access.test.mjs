import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const migration = readFileSync(
  'supabase/migrations/20260228160000_public_workshop_contact_rpc.sql',
  'utf8'
);
const contactPage = readFileSync('app/contact/page.tsx', 'utf8');

assert.match(
  migration,
  /create or replace function public\.get_public_workshop_contact\(\)[\s\S]*security definer/i
);
assert.match(
  migration,
  /grant execute on function public\.get_public_workshop_contact\(\) to anon;/i
);

const publicFields = [
  'name',
  'contact_email',
  'contact_phone',
  'website_url',
  'booking_url',
  'contact_signature'
];

for (const field of publicFields) {
  assert.match(migration, new RegExp(`\\b${field}\\b`, 'i'));
}

const forbiddenFields = ['slug', 'plan', 'id'];
for (const field of forbiddenFields) {
  assert.doesNotMatch(
    migration,
    new RegExp(`workshop_accounts\\.${field}\\b`, 'i'),
    `RPC must not expose private column ${field}`
  );
}

assert.match(
  contactPage,
  /\.rpc\('get_public_workshop_contact'\)/,
  'Contact page should use RPC for public/unassigned fetch path.'
);
assert.match(
  contactPage,
  /workshopNameFallback\s*=\s*profile\?\.workshop_account_id\s*\?\s*'Workshop'\s*:\s*'Main workshop'/,
  'Contact page fallback label should be Workshop/Main workshop.'
);

console.log('Public contact access checks passed.');
