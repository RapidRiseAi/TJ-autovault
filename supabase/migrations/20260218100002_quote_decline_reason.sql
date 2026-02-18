-- Add customer decision metadata for quote declines.

alter table if exists public.quotes
  add column if not exists customer_decision_reason text,
  add column if not exists customer_decision_at timestamptz;
