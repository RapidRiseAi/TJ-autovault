import assert from 'node:assert/strict';
import fs from 'node:fs';

const uploadForm = fs.readFileSync(
  'components/workshop/uploads-actions-form.tsx',
  'utf8'
);

assert.match(
  uploadForm,
  /import\s*\{\s*canCloseJobCard,\s*closeJobCard\s*\}\s*from '\@\/lib\/actions\/job-cards';/,
  'Upload form should import canCloseJobCard for invoice close preflight.'
);
assert.doesNotMatch(
  uploadForm,
  /updateJobCardStatus\s*\(/,
  'Invoice close flow must not auto-mutate status via updateJobCardStatus.'
);
assert.match(
  uploadForm,
  /title:\s*'Cannot close job yet'/,
  'Preflight failures should show a cannot-close toast before upload.'
);
assert.match(
  uploadForm,
  /Please complete the job and upload at least one completion photo before closing\./,
  'Preflight failures should provide the user-friendly close requirements message.'
);

const preflightIndex = uploadForm.indexOf('canCloseJobCard({ jobId: pendingCloseJobId })');
const signIndex = uploadForm.indexOf("fetch('/api/uploads/sign'");
assert.ok(preflightIndex >= 0, 'Invoice close preflight check should exist.');
assert.ok(signIndex >= 0, 'Upload signing call should exist.');
assert.ok(
  preflightIndex < signIndex,
  'Invoice close preflight should execute before upload signing.'
);

const jobCardsActions = fs.readFileSync('lib/actions/job-cards.ts', 'utf8');
assert.match(
  jobCardsActions,
  /export async function canCloseJobCard\(/,
  'A close preflight action should be available from job-cards actions.'
);
assert.match(
  jobCardsActions,
  /validateCloseJobCardOrError\(/,
  'Close and preflight checks should share the same validation helper.'
);

console.log('invoice-close-preflight tests passed');
