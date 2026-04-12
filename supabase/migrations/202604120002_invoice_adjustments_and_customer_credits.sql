create table if not exists public.invoice_adjustments (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  note_type text not null check (note_type in ('credit', 'debit')),
  status text not null default 'issued' check (status in ('draft', 'issued', 'cancelled')),
  reference_number text not null,
  issue_date date not null default current_date,
  reason text not null,
  notes text,
  subtotal_cents bigint not null default 0,
  tax_cents bigint not null default 0,
  total_cents bigint not null default 0,
  net_effect_cents bigint not null default 0,
  settlement_preference text check (settlement_preference in ('apply_to_invoice', 'carry_forward', 'refund')),
  applied_to_invoice_cents bigint not null default 0,
  carried_forward_cents bigint not null default 0,
  refund_cents bigint not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (workshop_account_id, reference_number)
);

create table if not exists public.invoice_adjustment_items (
  id uuid primary key default gen_random_uuid(),
  adjustment_id uuid not null references public.invoice_adjustments(id) on delete cascade,
  sort_order int not null default 0,
  description text not null,
  qty numeric(10,2) not null default 1,
  unit_price_cents bigint not null default 0,
  line_total_cents bigint not null default 0,
  tax_rate numeric(6,3) not null default 0,
  tax_cents bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  source_type text not null check (source_type in ('credit_note', 'credit_application', 'manual')),
  source_id uuid,
  description text,
  delta_cents bigint not null,
  remaining_cents bigint not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.invoice_credit_applications (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  ledger_entry_id uuid references public.customer_credit_ledger(id) on delete set null,
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create index if not exists invoice_adjustments_invoice_idx on public.invoice_adjustments(invoice_id, created_at desc);
create index if not exists customer_credit_ledger_customer_idx on public.customer_credit_ledger(customer_account_id, created_at asc);
create index if not exists customer_credit_ledger_remaining_idx on public.customer_credit_ledger(customer_account_id, remaining_cents);
create index if not exists invoice_credit_applications_invoice_idx on public.invoice_credit_applications(invoice_id, created_at desc);

alter table public.invoice_adjustments enable row level security;
alter table public.invoice_adjustment_items enable row level security;
alter table public.customer_credit_ledger enable row level security;
alter table public.invoice_credit_applications enable row level security;

drop policy if exists invoice_adjustments_select on public.invoice_adjustments;
create policy invoice_adjustments_select
on public.invoice_adjustments
for select
using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(customer_account_id));

drop policy if exists invoice_adjustments_insert on public.invoice_adjustments;
create policy invoice_adjustments_insert
on public.invoice_adjustments
for insert
with check (public.same_workshop(workshop_account_id));

drop policy if exists invoice_adjustments_update on public.invoice_adjustments;
create policy invoice_adjustments_update
on public.invoice_adjustments
for update
using (public.same_workshop(workshop_account_id))
with check (public.same_workshop(workshop_account_id));

drop policy if exists invoice_adjustment_items_select on public.invoice_adjustment_items;
create policy invoice_adjustment_items_select
on public.invoice_adjustment_items
for select
using (
  exists (
    select 1 from public.invoice_adjustments ia
    where ia.id = invoice_adjustment_items.adjustment_id
      and (public.same_workshop(ia.workshop_account_id) or public.is_customer_of_account(ia.customer_account_id))
  )
);

drop policy if exists invoice_adjustment_items_insert on public.invoice_adjustment_items;
create policy invoice_adjustment_items_insert
on public.invoice_adjustment_items
for insert
with check (
  exists (
    select 1 from public.invoice_adjustments ia
    where ia.id = invoice_adjustment_items.adjustment_id
      and public.same_workshop(ia.workshop_account_id)
  )
);

drop policy if exists customer_credit_ledger_select on public.customer_credit_ledger;
create policy customer_credit_ledger_select
on public.customer_credit_ledger
for select
using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(customer_account_id));

drop policy if exists customer_credit_ledger_insert on public.customer_credit_ledger;
create policy customer_credit_ledger_insert
on public.customer_credit_ledger
for insert
with check (public.same_workshop(workshop_account_id));

drop policy if exists customer_credit_ledger_update on public.customer_credit_ledger;
create policy customer_credit_ledger_update
on public.customer_credit_ledger
for update
using (public.same_workshop(workshop_account_id))
with check (public.same_workshop(workshop_account_id));

drop policy if exists invoice_credit_applications_select on public.invoice_credit_applications;
create policy invoice_credit_applications_select
on public.invoice_credit_applications
for select
using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(customer_account_id));

drop policy if exists invoice_credit_applications_insert on public.invoice_credit_applications;
create policy invoice_credit_applications_insert
on public.invoice_credit_applications
for insert
with check (public.same_workshop(workshop_account_id));
