alter table public.profiles
  add column if not exists full_name text,
  add column if not exists phone text,
  add column if not exists preferred_contact_method text not null default 'email',
  add column if not exists billing_name text,
  add column if not exists company_name text,
  add column if not exists billing_address text,
  add column if not exists avatar_url text;

alter table public.profiles
  drop constraint if exists profiles_preferred_contact_method_check;

alter table public.profiles
  add constraint profiles_preferred_contact_method_check
  check (preferred_contact_method in ('email', 'phone', 'sms'));

grant update (display_name, full_name, phone, preferred_contact_method, billing_name, company_name, billing_address, avatar_url)
  on table public.profiles to authenticated;
