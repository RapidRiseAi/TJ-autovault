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

  insert into public.profiles (id, workshop_account_id, role, display_name)
  values (v_user_id, v_workshop_account_id, 'customer', v_display_name)
  on conflict (id) do update
    set role = 'customer',
        display_name = coalesce(nullif(trim(excluded.display_name), ''), public.profiles.display_name),
        workshop_account_id = coalesce(public.profiles.workshop_account_id, excluded.workshop_account_id);

  update public.profiles
  set workshop_account_id = v_workshop_account_id
  where id = v_user_id and workshop_account_id is null;

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
