alter table public.profiles
  add column if not exists signature_image_path text;

alter table public.profiles
  add column if not exists signature_updated_at timestamptz;
