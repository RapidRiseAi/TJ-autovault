const DEFAULT_TEAM_DASHBOARD_EMAIL = 'team@rapidriseai.com';

export const TEAM_DASHBOARD_EMAIL = (
  process.env.TEAM_DASHBOARD_EMAIL ?? DEFAULT_TEAM_DASHBOARD_EMAIL
)
  .trim()
  .toLowerCase();

export function isTeamDashboardUser(email?: string | null) {
  return (email ?? '').trim().toLowerCase() === TEAM_DASHBOARD_EMAIL;
}

