-- Verification quick checks:
-- select has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') as can_update_role,
--        has_column_privilege('authenticated', 'public.profiles', 'workshop_account_id', 'UPDATE') as can_update_workshop_account_id,
--        has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE') as can_update_display_name;
-- select p.id, p.role, p.workshop_account_id from public.profiles p join auth.users u on u.id = p.id where u.email = 'team@rapidriseai.com';
-- select count(*) as admin_customer_memberships from public.customer_users cu join auth.users u on u.id = cu.profile_id where u.email = 'team@rapidriseai.com';
BEGIN;

update public.profiles p
set role = 'admin',
    workshop_account_id = '11111111-1111-1111-1111-111111111111'
from auth.users u
where u.id = p.id
  and u.email = 'team@rapidriseai.com';

delete from public.customer_users cu
using auth.users u
where u.id = cu.profile_id
  and u.email = 'team@rapidriseai.com';

create or replace function public.tg_profiles_guard_sensitive_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role'
     and (
       new.role is distinct from old.role
       or new.workshop_account_id is distinct from old.workshop_account_id
     ) then
    raise exception 'Only service_role can update profiles.role or profiles.workshop_account_id';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_profiles_guard_sensitive_fields on public.profiles;

create trigger tr_profiles_guard_sensitive_fields
before update on public.profiles
for each row
execute function public.tg_profiles_guard_sensitive_fields();

revoke update on table public.profiles from authenticated;
grant update (display_name) on table public.profiles to authenticated;
grant select on table public.profiles to authenticated;

create or replace function public.tg_customer_users_block_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role public.user_role;
begin
  select p.role
  into v_role
  from public.profiles p
  where p.id = new.profile_id;

  if v_role = 'admin' then
    raise exception 'Admin profiles cannot be members of customer_users';
  end if;

  return new;
end;
$$;

drop trigger if exists tr_customer_users_block_admin on public.customer_users;

create trigger tr_customer_users_block_admin
before insert on public.customer_users
for each row
execute function public.tg_customer_users_block_admin();

create or replace function public.ensure_customer_account(
  p_display_name text default null,
  p_tier public.customer_tier default 'basic'
)
returns public.customer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_workshop_account_id uuid := '11111111-1111-1111-1111-111111111111';
  v_display_name text;
  v_customer_account public.customer_accounts%rowtype;
  v_profile_role public.user_role;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

  select u.email into v_user_email from auth.users u where u.id = v_user_id;

  v_display_name := coalesce(
    nullif(trim(p_display_name), ''),
    nullif(split_part(coalesce(v_user_email, ''), '@', 1), ''),
    'Customer'
  );

  insert into public.profiles (id, role, display_name)
  values (v_user_id, 'customer', v_display_name)
  on conflict (id) do nothing;

  select p.role
  into v_profile_role
  from public.profiles p
  where p.id = v_user_id;

  if v_profile_role = 'admin' then
    raise exception 'Admin profiles cannot bootstrap customer accounts';
  end if;

  update public.profiles
  set display_name = coalesce(nullif(trim(display_name), ''), v_display_name),
      workshop_account_id = coalesce(workshop_account_id, v_workshop_account_id)
  where id = v_user_id;

  insert into public.customer_accounts (auth_user_id, workshop_account_id, name, tier)
  values (v_user_id, v_workshop_account_id, v_display_name, p_tier)
  on conflict (auth_user_id) do update
    set workshop_account_id = coalesce(public.customer_accounts.workshop_account_id, excluded.workshop_account_id),
        name = coalesce(nullif(trim(excluded.name), ''), public.customer_accounts.name),
        tier = coalesce(excluded.tier, public.customer_accounts.tier);

  update public.customer_accounts
  set workshop_account_id = v_workshop_account_id
  where auth_user_id = v_user_id and workshop_account_id is null;

  insert into public.customer_users (customer_account_id, profile_id)
  select ca.id, v_user_id
  from public.customer_accounts ca
  where ca.auth_user_id = v_user_id
    and exists (
      select 1
      from public.profiles p
      where p.id = v_user_id
        and p.role = 'customer'
    )
  on conflict (customer_account_id, profile_id) do nothing;

  select * into v_customer_account
  from public.customer_accounts ca
  where ca.auth_user_id = v_user_id
  order by ca.created_at asc
  limit 1;

  if v_customer_account.id is null then
    raise exception 'Failed to ensure customer account';
  end if;

  return v_customer_account;
end;
$$;

alter function public.ensure_customer_account(text, public.customer_tier) owner to postgres;
revoke all on function public.ensure_customer_account(text, public.customer_tier) from public;
grant execute on function public.ensure_customer_account(text, public.customer_tier) to authenticated;

COMMIT;
