import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260220150000_timeline_deletion_request_notifications.sql', 'utf8');
assert.match(migration, /push_notification_to_workshop\(/, 'Customer-created deletion requests should notify workshop staff');
assert.match(migration, /perform public\.push_notification\(/, 'Workshop-created deletion requests should notify customers');
assert.match(migration, /\/workshop\/vehicles\/\' \|\| v_vehicle_id::text \|\| '\/timeline\?deletionRequest='/, 'Workshop notification route should deep-link to deletion request context');
assert.match(migration, /\/customer\/vehicles\/\' \|\| v_vehicle_id::text \|\| '\/timeline\?deletionRequest='/, 'Customer notification route should deep-link to deletion request context');

const timelineAction = fs.readFileSync('lib/actions/timeline.ts', 'utf8');
assert.match(timelineAction, /attachment\?: \{/, 'Manual logs should support optional file attachments.');
assert.match(timelineAction, /customer_users/, 'Manual log creation should enforce customer ownership checks.');
assert.match(timelineAction, /metadata: \{[\s\S]*attachment/, 'Manual logs should save attachment metadata into timeline metadata.');

const uploadSignRoute = fs.readFileSync('app/api/uploads/sign/route.ts', 'utf8');
assert.match(uploadSignRoute, /Unsupported file type/, 'Upload signing should reject unsupported MIME types.');

const timelinePage = fs.readFileSync('app/customer/vehicles/[vehicleId]/timeline/page.tsx', 'utf8');
assert.match(timelinePage, /highlightedDeletionRequestId=\{deletionRequest\}/, 'Timeline should wire deletionRequest query param to highlighting context.');

console.log('timeline-feature tests passed');
