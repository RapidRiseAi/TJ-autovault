alter table if exists public.work_requests
  drop constraint if exists work_requests_request_type_check;

alter table if exists public.work_requests
  add constraint work_requests_request_type_check
  check (request_type in ('inspection','service','quote','diagnostic','repair','parts','other'));

alter table if exists public.work_requests
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

alter table if exists public.problem_reports
  add column if not exists subject text,
  add column if not exists attachment_bucket text,
  add column if not exists attachment_path text,
  add column if not exists attachment_name text;

-- keep notifications open for newer event kinds (job approvals, messaging, etc.)
do $$
declare
  allowed_kinds text[];
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  select array_agg(kind order by kind)
    into allowed_kinds
  from (
    select distinct kind
    from (
      select unnest(array['quote', 'invoice', 'request', 'report', 'system', 'message', 'job']::text[]) as kind
      union
      select n.kind
      from public.notifications n
      where n.kind is not null
    ) kinds
  ) distinct_kinds;

  alter table public.notifications
    drop constraint if exists notifications_kind_check;

  execute format(
    'alter table public.notifications add constraint notifications_kind_check check (kind = any (%L::text[]))',
    allowed_kinds
  );
end
$$;
