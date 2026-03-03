alter table public.customer_accounts
  add column if not exists linked_email text,
  add column if not exists onboarding_status text not null default 'prospect_unpaid';

update public.customer_accounts
set onboarding_status = case
  when auth_user_id is not null then 'registered_unpaid'
  else 'prospect_unpaid'
end
where onboarding_status is null
   or onboarding_status not in ('prospect_unpaid', 'registered_unpaid', 'active_paid');

alter table public.customer_accounts
  drop constraint if exists customer_accounts_onboarding_status_check;

alter table public.customer_accounts
  add constraint customer_accounts_onboarding_status_check
  check (onboarding_status in ('prospect_unpaid', 'registered_unpaid', 'active_paid'));

create index if not exists customer_accounts_linked_email_idx
  on public.customer_accounts (lower(linked_email))
  where linked_email is not null;

create or replace function public.claim_customer_account_for_current_user(
  p_email text default null
)
returns public.customer_accounts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text;
  v_claimed public.customer_accounts%rowtype;
  v_existing public.customer_accounts%rowtype;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select u.email into v_email
  from auth.users u
  where u.id = v_user_id;

  v_email := lower(coalesce(nullif(trim(p_email), ''), v_email));

  select * into v_existing
  from public.customer_accounts ca
  where ca.auth_user_id = v_user_id
  order by ca.created_at asc
  limit 1;

  if v_existing.id is not null then
    return v_existing;
  end if;

  if v_email is null or v_email = '' then
    return null;
  end if;

  update public.customer_accounts ca
  set auth_user_id = v_user_id,
      linked_email = coalesce(ca.linked_email, v_email),
      onboarding_status = case
        when ca.onboarding_status = 'active_paid' then 'active_paid'
        else 'registered_unpaid'
      end
  where ca.id = (
    select ca2.id
    from public.customer_accounts ca2
    where ca2.auth_user_id is null
      and lower(coalesce(ca2.linked_email, '')) = v_email
    order by ca2.created_at asc
    limit 1
  )
  returning * into v_claimed;

  if v_claimed.id is null then
    return null;
  end if;

  insert into public.profiles (id, role, display_name)
  values (v_user_id, 'customer', split_part(v_email, '@', 1))
  on conflict (id) do update
    set role = case
      when public.profiles.role = 'inactive_technician' then public.profiles.role
      else 'customer'
    end,
        workshop_account_id = coalesce(public.profiles.workshop_account_id, v_claimed.workshop_account_id),
        display_name = coalesce(nullif(trim(public.profiles.display_name), ''), split_part(v_email, '@', 1));

  update public.profiles
  set workshop_account_id = coalesce(workshop_account_id, v_claimed.workshop_account_id)
  where id = v_user_id;

  insert into public.customer_users (customer_account_id, profile_id)
  values (v_claimed.id, v_user_id)
  on conflict (customer_account_id, profile_id) do nothing;

  return v_claimed;
end;
$$;

alter function public.claim_customer_account_for_current_user(text) owner to postgres;
revoke all on function public.claim_customer_account_for_current_user(text) from public;
grant execute on function public.claim_customer_account_for_current_user(text) to authenticated;
