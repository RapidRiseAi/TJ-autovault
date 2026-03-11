alter table public.workshop_accounts
  add column if not exists co_reg_number text,
  add column if not exists bank_account_name text,
  add column if not exists bank_account_type text;

alter table public.customer_accounts
  add column if not exists billing_name text,
  add column if not exists billing_company text,
  add column if not exists billing_email text,
  add column if not exists billing_phone text,
  add column if not exists billing_tax_number text;
