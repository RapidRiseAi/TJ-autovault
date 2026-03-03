create table if not exists public.workshop_vendors (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  contact_person text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workshop_finance_targets (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  month_start date not null,
  income_target_cents bigint not null check (income_target_cents >= 0),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workshop_account_id, month_start)
);

create table if not exists public.workshop_finance_entries (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  entry_kind text not null check (entry_kind in ('income','expense')),
  source_type text not null check (source_type in ('manual_income','manual_expense','job_income','technician_payout','recurring_expense')),
  category text,
  description text,
  amount_cents bigint not null check (amount_cents >= 0),
  occurred_on date not null,
  vendor_id uuid references public.workshop_vendors(id) on delete set null,
  external_ref_type text,
  external_ref_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique nulls not distinct (workshop_account_id, source_type, external_ref_type, external_ref_id)
);

create table if not exists public.workshop_recurring_expenses (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vendor_id uuid references public.workshop_vendors(id) on delete set null,
  title text not null,
  amount_cents bigint not null check (amount_cents >= 0),
  category text,
  cadence text not null check (cadence in ('weekly','monthly')),
  next_run_on date not null,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workshop_monthly_statement_archives (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  month_start date not null,
  month_end date not null,
  totals jsonb not null default '{}'::jsonb,
  line_items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (workshop_account_id, month_start)
);

create index if not exists workshop_vendors_workshop_idx
  on public.workshop_vendors (workshop_account_id, name);
create index if not exists workshop_finance_entries_workshop_date_idx
  on public.workshop_finance_entries (workshop_account_id, occurred_on desc);
create index if not exists workshop_finance_entries_vendor_idx
  on public.workshop_finance_entries (vendor_id, occurred_on desc);
create index if not exists workshop_recurring_expenses_workshop_idx
  on public.workshop_recurring_expenses (workshop_account_id, is_active, next_run_on);
create index if not exists workshop_statement_archives_workshop_idx
  on public.workshop_monthly_statement_archives (workshop_account_id, month_start desc);

create or replace function public.touch_updated_at_generic()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_workshop_vendors_updated_at on public.workshop_vendors;
create trigger trg_workshop_vendors_updated_at
before update on public.workshop_vendors
for each row execute function public.touch_updated_at_generic();

drop trigger if exists trg_workshop_finance_targets_updated_at on public.workshop_finance_targets;
create trigger trg_workshop_finance_targets_updated_at
before update on public.workshop_finance_targets
for each row execute function public.touch_updated_at_generic();

drop trigger if exists trg_workshop_finance_entries_updated_at on public.workshop_finance_entries;
create trigger trg_workshop_finance_entries_updated_at
before update on public.workshop_finance_entries
for each row execute function public.touch_updated_at_generic();

drop trigger if exists trg_workshop_recurring_expenses_updated_at on public.workshop_recurring_expenses;
create trigger trg_workshop_recurring_expenses_updated_at
before update on public.workshop_recurring_expenses
for each row execute function public.touch_updated_at_generic();

create or replace function public.sync_finance_entry_from_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_is_paid boolean;
  v_occurred_on date;
begin
  v_is_paid := coalesce(new.payment_status, '') = 'paid' or coalesce(new.status, '') = 'paid';
  v_occurred_on := coalesce(new.updated_at::date, new.created_at::date, now()::date);

  if v_is_paid then
    insert into public.workshop_finance_entries (
      workshop_account_id,
      entry_kind,
      source_type,
      category,
      description,
      amount_cents,
      occurred_on,
      external_ref_type,
      external_ref_id,
      metadata
    ) values (
      new.workshop_account_id,
      'income',
      'job_income',
      'jobs',
      'Invoice payment',
      greatest(coalesce(new.total_cents, 0), 0),
      v_occurred_on,
      'invoice',
      new.id::text,
      jsonb_build_object('invoice_id', new.id)
    )
    on conflict (workshop_account_id, source_type, external_ref_type, external_ref_id)
    do update set
      amount_cents = excluded.amount_cents,
      occurred_on = excluded.occurred_on,
      metadata = excluded.metadata,
      updated_at = now();
  else
    delete from public.workshop_finance_entries
    where workshop_account_id = new.workshop_account_id
      and source_type = 'job_income'
      and external_ref_type = 'invoice'
      and external_ref_id = new.id::text;
  end if;

  return new;
end;
$$;

create or replace function public.sync_finance_entry_from_payout()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(new.status, '') = 'rejected' then
    delete from public.workshop_finance_entries
    where workshop_account_id = new.workshop_account_id
      and source_type = 'technician_payout'
      and external_ref_type = 'technician_payout'
      and external_ref_id = new.id::text;
    return new;
  end if;

  insert into public.workshop_finance_entries (
    workshop_account_id,
    entry_kind,
    source_type,
    category,
    description,
    amount_cents,
    occurred_on,
    external_ref_type,
    external_ref_id,
    metadata,
    created_by
  ) values (
    new.workshop_account_id,
    'expense',
    'technician_payout',
    'technician_pay',
    coalesce(new.notes, 'Technician payout'),
    greatest(coalesce(new.amount_cents, 0), 0),
    coalesce(new.paid_at::date, new.created_at::date, now()::date),
    'technician_payout',
    new.id::text,
    jsonb_build_object('technician_profile_id', new.technician_profile_id, 'status', new.status),
    new.created_by
  )
  on conflict (workshop_account_id, source_type, external_ref_type, external_ref_id)
  do update set
    amount_cents = excluded.amount_cents,
    occurred_on = excluded.occurred_on,
    description = excluded.description,
    metadata = excluded.metadata,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists trg_sync_finance_invoice on public.invoices;
create trigger trg_sync_finance_invoice
after insert or update of payment_status, status, total_cents, updated_at
on public.invoices
for each row execute function public.sync_finance_entry_from_invoice();

drop trigger if exists trg_sync_finance_payout on public.technician_payouts;
create trigger trg_sync_finance_payout
after insert or update of status, amount_cents, paid_at, notes
on public.technician_payouts
for each row execute function public.sync_finance_entry_from_payout();

insert into public.workshop_finance_entries (
  workshop_account_id,
  entry_kind,
  source_type,
  category,
  description,
  amount_cents,
  occurred_on,
  external_ref_type,
  external_ref_id,
  metadata
)
select
  i.workshop_account_id,
  'income',
  'job_income',
  'jobs',
  'Invoice payment',
  greatest(coalesce(i.total_cents, 0), 0),
  coalesce(i.updated_at::date, i.created_at::date, now()::date),
  'invoice',
  i.id::text,
  jsonb_build_object('invoice_id', i.id)
from public.invoices i
where coalesce(i.payment_status, '') = 'paid' or coalesce(i.status, '') = 'paid'
on conflict (workshop_account_id, source_type, external_ref_type, external_ref_id)
do update set
  amount_cents = excluded.amount_cents,
  occurred_on = excluded.occurred_on,
  metadata = excluded.metadata,
  updated_at = now();

insert into public.workshop_finance_entries (
  workshop_account_id,
  entry_kind,
  source_type,
  category,
  description,
  amount_cents,
  occurred_on,
  external_ref_type,
  external_ref_id,
  metadata,
  created_by
)
select
  p.workshop_account_id,
  'expense',
  'technician_payout',
  'technician_pay',
  coalesce(p.notes, 'Technician payout'),
  greatest(coalesce(p.amount_cents, 0), 0),
  coalesce(p.paid_at::date, p.created_at::date, now()::date),
  'technician_payout',
  p.id::text,
  jsonb_build_object('technician_profile_id', p.technician_profile_id, 'status', p.status),
  p.created_by
from public.technician_payouts p
where coalesce(p.status, '') <> 'rejected'
on conflict (workshop_account_id, source_type, external_ref_type, external_ref_id)
do update set
  amount_cents = excluded.amount_cents,
  occurred_on = excluded.occurred_on,
  description = excluded.description,
  metadata = excluded.metadata,
  updated_at = now();

alter table public.workshop_vendors enable row level security;
alter table public.workshop_finance_targets enable row level security;
alter table public.workshop_finance_entries enable row level security;
alter table public.workshop_recurring_expenses enable row level security;
alter table public.workshop_monthly_statement_archives enable row level security;

drop policy if exists workshop_vendors_staff_select on public.workshop_vendors;
create policy workshop_vendors_staff_select
on public.workshop_vendors for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists workshop_vendors_admin_write on public.workshop_vendors;
create policy workshop_vendors_admin_write
on public.workshop_vendors for all to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists workshop_finance_targets_staff_select on public.workshop_finance_targets;
create policy workshop_finance_targets_staff_select
on public.workshop_finance_targets for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists workshop_finance_targets_admin_write on public.workshop_finance_targets;
create policy workshop_finance_targets_admin_write
on public.workshop_finance_targets for all to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists workshop_finance_entries_staff_select on public.workshop_finance_entries;
create policy workshop_finance_entries_staff_select
on public.workshop_finance_entries for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists workshop_finance_entries_admin_write on public.workshop_finance_entries;
create policy workshop_finance_entries_admin_write
on public.workshop_finance_entries for all to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists workshop_recurring_expenses_staff_select on public.workshop_recurring_expenses;
create policy workshop_recurring_expenses_staff_select
on public.workshop_recurring_expenses for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists workshop_recurring_expenses_admin_write on public.workshop_recurring_expenses;
create policy workshop_recurring_expenses_admin_write
on public.workshop_recurring_expenses for all to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists workshop_statement_archives_staff_select on public.workshop_monthly_statement_archives;
create policy workshop_statement_archives_staff_select
on public.workshop_monthly_statement_archives for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists workshop_statement_archives_admin_write on public.workshop_monthly_statement_archives;
create policy workshop_statement_archives_admin_write
on public.workshop_monthly_statement_archives for all to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));
