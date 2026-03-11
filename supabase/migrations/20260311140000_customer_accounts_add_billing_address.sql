alter table public.customer_accounts
  add column if not exists billing_address text;
