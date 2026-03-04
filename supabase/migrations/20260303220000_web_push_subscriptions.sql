-- Web push subscriptions + delivery tracking

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_profile_active_idx
  on public.push_subscriptions(profile_id, is_active, created_at desc);

create table if not exists public.push_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications(id) on delete cascade,
  push_subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  status text not null default 'delivered',
  unique (notification_id, push_subscription_id)
);

create index if not exists push_notification_deliveries_notification_idx
  on public.push_notification_deliveries(notification_id, delivered_at desc);

alter table public.push_subscriptions enable row level security;
alter table public.push_notification_deliveries enable row level security;

drop policy if exists push_subscriptions_select_self on public.push_subscriptions;
create policy push_subscriptions_select_self
on public.push_subscriptions
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists push_subscriptions_insert_self on public.push_subscriptions;
create policy push_subscriptions_insert_self
on public.push_subscriptions
for insert
to authenticated
with check (profile_id = auth.uid());

drop policy if exists push_subscriptions_update_self on public.push_subscriptions;
create policy push_subscriptions_update_self
on public.push_subscriptions
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists push_notification_deliveries_select_self on public.push_notification_deliveries;
create policy push_notification_deliveries_select_self
on public.push_notification_deliveries
for select
to authenticated
using (
  exists (
    select 1
    from public.push_subscriptions ps
    where ps.id = push_notification_deliveries.push_subscription_id
      and ps.profile_id = auth.uid()
  )
);

notify pgrst, 'reload schema';
