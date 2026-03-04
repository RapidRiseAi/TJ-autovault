-- Email notification preferences + recipients + queue.

create table if not exists public.notification_email_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  email_enabled boolean not null default true,
  notify_messages boolean not null default true,
  notify_quotes boolean not null default true,
  notify_invoices boolean not null default true,
  notify_requests boolean not null default true,
  notify_reports boolean not null default true,
  notify_recommendations boolean not null default true,
  notify_system boolean not null default true,
  notify_job_updates boolean not null default true,
  notify_payouts boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notification_email_recipients (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  position smallint not null,
  email text not null,
  label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_email_recipients_position_check check (position in (1, 2))
);

create unique index if not exists notification_email_recipients_profile_position_key
  on public.notification_email_recipients(profile_id, position);

create table if not exists public.notification_email_queue (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  status text not null default 'pending',
  attempt_count integer not null default 0,
  last_error text,
  last_attempted_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_email_queue_status_check check (status in ('pending', 'sent', 'failed'))
);

create index if not exists notification_email_queue_status_created_idx
  on public.notification_email_queue(status, created_at asc);

create or replace function public.enqueue_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_email_queue(notification_id)
  values (new.id)
  on conflict (notification_id) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_enqueue_notification_email on public.notifications;
create trigger trg_enqueue_notification_email
after insert on public.notifications
for each row
execute function public.enqueue_notification_email();

alter table public.notification_email_preferences enable row level security;
alter table public.notification_email_recipients enable row level security;

drop policy if exists notification_email_preferences_select_self on public.notification_email_preferences;
create policy notification_email_preferences_select_self
on public.notification_email_preferences
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists notification_email_preferences_upsert_self on public.notification_email_preferences;
create policy notification_email_preferences_upsert_self
on public.notification_email_preferences
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

drop policy if exists notification_email_recipients_select_self on public.notification_email_recipients;
create policy notification_email_recipients_select_self
on public.notification_email_recipients
for select
to authenticated
using (profile_id = auth.uid());

drop policy if exists notification_email_recipients_upsert_self on public.notification_email_recipients;
create policy notification_email_recipients_upsert_self
on public.notification_email_recipients
for all
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

notify pgrst, 'reload schema';
