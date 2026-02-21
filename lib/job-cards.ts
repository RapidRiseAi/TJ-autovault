export const JOB_CARD_STATUSES = [
  'not_started',
  'in_progress',
  'waiting_parts',
  'waiting_approval',
  'quality_check',
  'ready',
  'completed',
  'closed'
] as const;

export type JobCardStatus = (typeof JOB_CARD_STATUSES)[number];

export const MAJOR_JOB_TIMELINE_STATUSES = new Set<JobCardStatus>(['waiting_parts', 'waiting_approval']);

export function formatJobCardStatus(status: string | null | undefined) {
  return (status ?? 'not_started').replaceAll('_', ' ');
}

export function jobProgressIndex(status: string | null | undefined) {
  const map: Record<string, number> = {
    not_started: 0,
    in_progress: 1,
    waiting_parts: 2,
    waiting_approval: 2,
    quality_check: 3,
    ready: 4,
    completed: 4,
    closed: 4
  };
  return map[status ?? 'not_started'] ?? 0;
}
