export const WORK_REQUEST_STATUSES = [
  'requested',
  'waiting_for_deposit',
  'waiting_for_parts',
  'scheduled',
  'in_progress',
  'completed',
  'delivered',
  'cancelled'
] as const;

export type WorkRequestStatus = (typeof WORK_REQUEST_STATUSES)[number];
