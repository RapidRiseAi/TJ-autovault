-- Fix invoice schema drift for upload flow.

alter table if exists public.invoices
  add column if not exists notes text,
  add column if not exists subject text;

notify pgrst, 'reload schema';
