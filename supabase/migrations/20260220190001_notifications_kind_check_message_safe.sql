-- Safely expand notifications_kind_check to include baseline kinds while preserving existing data kinds.
do $$
declare
  allowed_kinds text[];
begin
  -- Guard for environments where notifications table does not exist yet.
  if to_regclass('public.notifications') is null then
    return;
  end if;

  select array_agg(kind order by kind)
    into allowed_kinds
  from (
    select distinct kind
    from (
      select unnest(array['quote', 'invoice', 'request', 'report', 'system', 'message']::text[]) as kind
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
