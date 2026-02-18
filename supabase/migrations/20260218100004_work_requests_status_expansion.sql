-- Expand work request statuses for workshop job workflow.

alter table if exists public.work_requests
  drop constraint if exists work_requests_status_check;

alter table if exists public.work_requests
  add constraint work_requests_status_check
  check (
    status in (
      'requested',
      'waiting_for_deposit',
      'waiting_for_parts',
      'scheduled',
      'in_progress',
      'completed',
      'delivered',
      'cancelled'
    )
  );
