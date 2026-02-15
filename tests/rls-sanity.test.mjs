import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const migration = readFileSync('supabase/migrations/202602150001_init.sql', 'utf8');

const requiredTables = [
  'workshop_accounts',
  'profiles',
  'customer_accounts',
  'vehicles',
  'work_orders',
  'timeline_events',
  'audit_logs'
];

for (const table of requiredTables) {
  assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
}

const requiredTriggers = [
  'immutable_timeline_update',
  'immutable_inspections_update',
  'immutable_inspection_items_update',
  'immutable_quotes_update',
  'immutable_invoices_update',
  'immutable_payments_update',
  'immutable_attachments_update',
  'immutable_audit_update'
];

for (const trigger of requiredTriggers) {
  assert.match(migration, new RegExp(`create trigger ${trigger}`, 'i'));
}

console.log('RLS and immutability sanity checks passed.');
