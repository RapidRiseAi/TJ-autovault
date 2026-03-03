alter table public.workshop_monthly_statement_archives
  add column if not exists pdf_storage_path text,
  add column if not exists pdf_generated_at timestamptz;
