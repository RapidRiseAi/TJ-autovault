alter table public.invoice_adjustments
  add column if not exists document_id uuid references public.vehicle_documents(id) on delete set null;
