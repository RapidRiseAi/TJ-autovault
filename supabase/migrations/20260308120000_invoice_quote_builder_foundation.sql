alter table public.workshop_accounts
  add column if not exists billing_address text,
  add column if not exists tax_number text,
  add column if not exists bank_name text,
  add column if not exists bank_account_number text,
  add column if not exists bank_branch_code text,
  add column if not exists invoice_payment_terms_days int,
  add column if not exists quote_validity_days int,
  add column if not exists invoice_footer text;

alter table public.quotes
  add column if not exists issue_date date,
  add column if not exists expiry_date date,
  add column if not exists currency_code text not null default 'ZAR',
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists pdf_storage_path text,
  add column if not exists customer_snapshot jsonb,
  add column if not exists workshop_snapshot jsonb,
  add column if not exists subject text,
  add column if not exists document_id uuid references public.vehicle_documents(id) on delete set null;

alter table public.invoices
  add column if not exists issue_date date,
  add column if not exists subtotal_cents bigint not null default 0,
  add column if not exists tax_cents bigint not null default 0,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists amount_paid_cents bigint not null default 0,
  add column if not exists balance_due_cents bigint not null default 0,
  add column if not exists currency_code text not null default 'ZAR',
  add column if not exists pdf_storage_path text,
  add column if not exists customer_snapshot jsonb,
  add column if not exists workshop_snapshot jsonb,
  add column if not exists subject text,
  add column if not exists document_id uuid references public.vehicle_documents(id) on delete set null;

alter table public.quote_items
  add column if not exists sort_order int not null default 0,
  add column if not exists discount_type text not null default 'none' check (discount_type in ('none','percent','fixed')),
  add column if not exists discount_value numeric(10,2) not null default 0,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists tax_rate numeric(6,3) not null default 0,
  add column if not exists tax_cents bigint not null default 0,
  add column if not exists category text;

alter table public.invoice_items
  add column if not exists sort_order int not null default 0,
  add column if not exists discount_type text not null default 'none' check (discount_type in ('none','percent','fixed')),
  add column if not exists discount_value numeric(10,2) not null default 0,
  add column if not exists discount_cents bigint not null default 0,
  add column if not exists tax_rate numeric(6,3) not null default 0,
  add column if not exists tax_cents bigint not null default 0,
  add column if not exists category text;
