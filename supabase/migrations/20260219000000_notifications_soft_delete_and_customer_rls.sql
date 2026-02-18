-- Customer notification inbox upgrades: soft delete + idempotent RLS/indexes.

alter table if exists public.notifications
  add column if not exists deleted_at timestamptz;

create index if not exists notifications_customer_unread_active_idx
  on public.notifications(to_customer_account_id, is_read, created_at desc)
  where deleted_at is null;

create index if not exists notifications_customer_deleted_idx
  on public.notifications(to_customer_account_id, deleted_at, created_at desc);

alter table if exists public.notifications enable row level security;

drop policy if exists notifications_select on public.notifications;
create policy notifications_select
on public.notifications
for select
to authenticated
using (
  (
    to_customer_account_id = public.current_customer_account_id()
    and deleted_at is null
  )
  or to_profile_id = public.current_profile_id()
);

drop policy if exists notifications_update on public.notifications;
create policy notifications_update
on public.notifications
for update
to authenticated
using (
  (
    to_customer_account_id = public.current_customer_account_id()
    and deleted_at is null
  )
  or to_profile_id = public.current_profile_id()
)
with check (
  (
    to_customer_account_id = public.current_customer_account_id()
  )
  or to_profile_id = public.current_profile_id()
);
