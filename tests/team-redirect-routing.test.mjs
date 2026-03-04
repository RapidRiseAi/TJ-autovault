import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const roleRedirect = readFileSync('lib/auth/role-redirect.ts', 'utf8');
const teamAccess = readFileSync('lib/auth/team-access.ts', 'utf8');
const middleware = readFileSync('middleware.ts', 'utf8');

assert.match(
  teamAccess,
  /DEFAULT_TEAM_DASHBOARD_EMAIL\s*=\s*'team@rapidriseai\.com'/,
  'Team access helper should include the default team dashboard email.'
);

assert.match(
  teamAccess,
  /process\.env\.TEAM_DASHBOARD_EMAIL\s*\?\?\s*DEFAULT_TEAM_DASHBOARD_EMAIL/,
  'Team access helper should support env overrides.'
);

assert.match(
  roleRedirect,
  /export function resolvePostLoginPath\([\s\S]*isTeamDashboardUser\(email\)[\s\S]*return '\/team\/dashboard'/,
  'resolvePostLoginPath should prioritize team dashboard routing by email.'
);

assert.match(
  middleware,
  /const isTeamRoute = path\.startsWith\('\/team'\)/,
  'Middleware should detect /team routes.'
);

assert.match(
  middleware,
  /if \(isTeamRoute && !isTeamDashboardUser\(user\.email\)\) \{[\s\S]*resolvePostLoginPath\(\{ role, email: user\.email \}\)/,
  'Middleware should reject unauthorized /team access to a resolved dashboard path.'
);

console.log('Team redirect routing checks passed.');
