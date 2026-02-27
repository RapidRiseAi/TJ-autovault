-- Follow-up migration for job-card assignment workflow.
-- Uses a fresh version to avoid duplicate-version ordering conflicts in Supabase migration history.

alter table public.job_card_assignments
  add column if not exists status text,
  add column if not exists invited_by uuid references public.profiles(id) on delete set null,
  add column if not exists accepted_at timestamptz,
  add column if not exists force_assigned boolean;

update public.job_card_assignments
set status = coalesce(
      case when status in ('invited', 'accepted', 'forced') then status else null end,
      'accepted'
    ),
    accepted_at = coalesce(accepted_at, created_at),
    force_assigned = coalesce(force_assigned, false)
where status is null
   or status not in ('invited', 'accepted', 'forced')
   or accepted_at is null
   or force_assigned is null;

alter table public.job_card_assignments
  alter column status set default 'accepted',
  alter column status set not null,
  alter column force_assigned set default false,
  alter column force_assigned set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_card_assignments_status_check'
      and conrelid = 'public.job_card_assignments'::regclass
  ) then
    alter table public.job_card_assignments
      add constraint job_card_assignments_status_check
      check (status in ('invited', 'accepted', 'forced'));
  end if;
end
$$;

create index if not exists job_card_assignments_status_idx
  on public.job_card_assignments(job_card_id, status, created_at desc);
