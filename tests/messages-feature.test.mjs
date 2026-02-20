import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260220190000_customer_workshop_messaging.sql', 'utf8');
assert.match(migration, /create table if not exists public\.message_conversations/i, 'Should create conversations table');
assert.match(migration, /create table if not exists public\.messages/i, 'Should create messages table');
assert.match(migration, /create table if not exists public\.message_document_history/i, 'Should store non-vehicle message history for documents context');
assert.match(migration, /event_type.*message_sent/s, 'Vehicle timeline should support message_sent events');
assert.match(migration, /event_type.*message_reply/s, 'Vehicle timeline should support message_reply events');
assert.match(migration, /push_notification_to_workshop\(/, 'Customer messages should notify workshop');
assert.match(migration, /push_notification\(/, 'Workshop messages should notify customer');
assert.match(migration, /\/customer\/notifications\?messageThread=/, 'Customer notifications should deep-link to message thread');
assert.match(migration, /\/workshop\/notifications\?messageThread=/, 'Workshop notifications should deep-link to message thread');

const notificationsUi = fs.readFileSync('components/layout/notifications-live.tsx', 'utf8');
assert.match(notificationsUi, /setFilter\('messages'\)/, 'Notifications UI should provide Messages filter');
assert.match(notificationsUi, /item\.kind === 'message'/, 'Message notifications should be visually differentiated');
assert.match(notificationsUi, /MessageThreadPanel/, 'Notifications flow should support opening threaded conversation detail');

const actions = fs.readFileSync('lib/actions/messages.ts', 'utf8');
assert.match(actions, /createMessage\(/, 'Action should create message threads');
assert.match(actions, /replyToMessage\(/, 'Action should support replies');

console.log('messages-feature tests passed');
