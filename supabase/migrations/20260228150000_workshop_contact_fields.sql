alter table public.workshop_accounts
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists website_url text,
  add column if not exists booking_url text,
  add column if not exists contact_signature text;

drop policy if exists workshop_update_admin on public.workshop_accounts;

create policy workshop_update_admin on public.workshop_accounts
for update
using (public.same_workshop(id) and public.is_admin())
with check (public.same_workshop(id) and public.is_admin());
