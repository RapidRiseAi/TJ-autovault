alter table public.job_card_assignments
  add column if not exists status text not null default 'accepted'
    check (status in ('invited','accepted','forced')),
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists force_assigned boolean not null default false;

update public.job_card_assignments
set status = 'accepted',
    accepted_at = coalesce(accepted_at, created_at),
    force_assigned = coalesce(force_assigned, false)
where status is null or status not in ('invited','accepted','forced');

create index if not exists job_card_assignments_status_idx
  on public.job_card_assignments(job_card_id, status, created_at desc);
