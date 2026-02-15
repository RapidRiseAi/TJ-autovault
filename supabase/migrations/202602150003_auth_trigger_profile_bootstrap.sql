create or replace function public.bootstrap_customer_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_display_name text;
begin
  resolved_display_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Customer'
  );

  insert into public.profiles (id, role, display_name)
  values (new.id, 'customer', resolved_display_name)
  on conflict (id) do nothing;

  return new;
end;
$$;

alter function public.bootstrap_customer_profile_from_auth_user() owner to postgres;

drop trigger if exists on_auth_user_created_bootstrap_profile on auth.users;

create trigger on_auth_user_created_bootstrap_profile
after insert on auth.users
for each row
execute function public.bootstrap_customer_profile_from_auth_user();

drop policy if exists profiles_self_insert on public.profiles;

create policy profiles_self_update_display_name on public.profiles
for update
using (id = auth.uid())
with check (id = auth.uid());
