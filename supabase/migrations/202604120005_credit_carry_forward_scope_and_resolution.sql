alter table public.customer_credit_ledger
  add column if not exists apply_scope text,
  add column if not exists vehicle_id uuid references public.vehicles(id) on delete set null,
  add column if not exists apply_once boolean not null default false,
  add column if not exists consumed_at timestamptz,
  add column if not exists note_reference text;

update public.customer_credit_ledger
set apply_scope = coalesce(apply_scope, 'customer')
where apply_scope is null;

alter table public.customer_credit_ledger
  alter column apply_scope set default 'customer';

alter table public.customer_credit_ledger
  drop constraint if exists customer_credit_ledger_apply_scope_check;

alter table public.customer_credit_ledger
  add constraint customer_credit_ledger_apply_scope_check
  check (apply_scope in ('customer', 'vehicle'));

create index if not exists customer_credit_ledger_scope_idx
  on public.customer_credit_ledger(customer_account_id, apply_scope, vehicle_id, created_at asc);

alter table public.invoice_adjustments
  add column if not exists apply_scope text;

update public.invoice_adjustments
set apply_scope = coalesce(apply_scope, 'customer')
where apply_scope is null;

alter table public.invoice_adjustments
  alter column apply_scope set default 'customer';

alter table public.invoice_adjustments
  drop constraint if exists invoice_adjustments_apply_scope_check;

alter table public.invoice_adjustments
  add constraint invoice_adjustments_apply_scope_check
  check (apply_scope in ('customer', 'vehicle'));
