create or replace function public.get_public_workshop_contact()
returns table (
  name text,
  contact_email text,
  contact_phone text,
  website_url text,
  booking_url text,
  contact_signature text
)
language sql
security definer
set search_path = public
as $$
  select
    workshop_accounts.name,
    workshop_accounts.contact_email,
    workshop_accounts.contact_phone,
    workshop_accounts.website_url,
    workshop_accounts.booking_url,
    workshop_accounts.contact_signature
  from public.workshop_accounts
  order by workshop_accounts.created_at asc
  limit 1;
$$;

grant execute on function public.get_public_workshop_contact() to anon;
grant execute on function public.get_public_workshop_contact() to authenticated;
