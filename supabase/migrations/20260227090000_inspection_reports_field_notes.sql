alter table if exists public.inspection_reports
  add column if not exists field_notes jsonb null;
