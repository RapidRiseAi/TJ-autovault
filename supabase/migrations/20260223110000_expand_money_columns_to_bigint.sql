-- Allow larger quote/invoice values without int4 overflow.
alter table public.quotes
  alter column subtotal_cents type bigint,
  alter column tax_cents type bigint,
  alter column total_cents type bigint;

alter table public.quote_items
  alter column unit_price_cents type bigint,
  alter column line_total_cents type bigint;

alter table public.invoices
  alter column total_cents type bigint;

alter table public.invoice_items
  alter column unit_price_cents type bigint,
  alter column line_total_cents type bigint;
