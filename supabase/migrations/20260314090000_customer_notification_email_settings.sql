create table if not exists public.customer_notification_email_settings (
  customer_account_id uuid primary key references public.customer_accounts(id) on delete cascade,
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  email_enabled boolean not null default true,
  send_to_email text,
  notify_quotes boolean not null default true,
  notify_invoices boolean not null default true,
  notify_reports boolean not null default true,
  notify_system boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_notification_email_settings_workshop_idx
  on public.customer_notification_email_settings(workshop_account_id);
