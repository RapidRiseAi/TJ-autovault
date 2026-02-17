-- Sync/backfill migration for production drift:
-- - quote_number/invoice_number fields used by manual timeline/notification definitions.

alter table public.quotes
  add column if not exists quote_number text;

alter table public.invoices
  add column if not exists invoice_number text;

update public.quotes
set quote_number = coalesce(
  quote_number,
  'Q-' || to_char(coalesce(created_at, now()), 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))
)
where quote_number is null;

update public.invoices
set invoice_number = coalesce(
  invoice_number,
  'INV-' || to_char(coalesce(created_at, now()), 'YYYYMMDD') || '-' || upper(substr(replace(id::text, '-', ''), 1, 6))
)
where invoice_number is null;

create unique index if not exists quotes_quote_number_key
  on public.quotes (quote_number)
  where quote_number is not null;

create unique index if not exists invoices_invoice_number_key
  on public.invoices (invoice_number)
  where invoice_number is not null;

create or replace function public.assign_quote_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.quote_number is null or btrim(new.quote_number) = '' then
    new.quote_number := 'Q-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

create or replace function public.assign_invoice_number()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.invoice_number is null or btrim(new.invoice_number) = '' then
    new.invoice_number := 'INV-' || to_char(now(), 'YYYYMMDD') || '-' || upper(substr(replace(new.id::text, '-', ''), 1, 6));
  end if;
  return new;
end;
$$;

drop trigger if exists trg_assign_quote_number on public.quotes;
create trigger trg_assign_quote_number
before insert on public.quotes
for each row execute function public.assign_quote_number();

drop trigger if exists trg_assign_invoice_number on public.invoices;
create trigger trg_assign_invoice_number
before insert on public.invoices
for each row execute function public.assign_invoice_number();
