alter table public.vehicles
  add column if not exists engine_number text;

alter table public.quotes
  add column if not exists order_number text;

alter table public.invoices
  add column if not exists order_number text;
