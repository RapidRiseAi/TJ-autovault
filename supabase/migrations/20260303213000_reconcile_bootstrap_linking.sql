create or replace function public.ensure_customer_account_for_user(
  p_user_id uuid,
  p_email text,
  p_raw_user_meta_data jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  resolved_display_name text;
  resolved_phone text;
  resolved_account_name text;
  v_customer_account_id uuid;
  v_workshop_account_id uuid;
  v_email text;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  v_email := lower(nullif(trim(coalesce(p_email, '')), ''));

  resolved_display_name := coalesce(
    nullif(trim(p_raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'Customer'
  );

  resolved_phone := nullif(trim(coalesce(p_raw_user_meta_data ->> 'phone', '')), '');

  resolved_account_name := coalesce(
    nullif(resolved_display_name, ''),
    nullif(split_part(coalesce(v_email, ''), '@', 1), ''),
    'Customer'
  );

  insert into public.profiles (id, role, display_name, full_name, phone)
  values (p_user_id, 'customer', resolved_display_name, resolved_display_name, resolved_phone)
  on conflict (id) do update
    set role = 'customer',
        display_name = coalesce(nullif(trim(excluded.display_name), ''), public.profiles.display_name),
        full_name = coalesce(nullif(trim(excluded.full_name), ''), public.profiles.full_name),
        phone = coalesce(nullif(trim(excluded.phone), ''), public.profiles.phone);

  select ca.id, ca.workshop_account_id
  into v_customer_account_id, v_workshop_account_id
  from public.customer_accounts ca
  where ca.auth_user_id = p_user_id
  order by ca.created_at asc
  limit 1;

  if v_customer_account_id is null and v_email is not null then
    update public.customer_accounts ca
    set auth_user_id = p_user_id,
        linked_email = coalesce(ca.linked_email, v_email),
        onboarding_status = case
          when ca.onboarding_status = 'active_paid' then 'active_paid'
          else 'registered_unpaid'
        end,
        name = coalesce(nullif(trim(resolved_account_name), ''), ca.name)
    where ca.id = (
      select ca2.id
      from public.customer_accounts ca2
      where ca2.auth_user_id is null
        and lower(coalesce(ca2.linked_email, '')) = v_email
      order by ca2.created_at asc
      limit 1
    )
    returning ca.id, ca.workshop_account_id
    into v_customer_account_id, v_workshop_account_id;
  end if;

  if v_customer_account_id is null then
    insert into public.customer_accounts (workshop_account_id, name, tier, auth_user_id, linked_email, onboarding_status)
    values (
      '11111111-1111-1111-1111-111111111111',
      resolved_account_name,
      'basic',
      p_user_id,
      v_email,
      'registered_unpaid'
    )
    returning id, workshop_account_id into v_customer_account_id, v_workshop_account_id;
  end if;

  delete from public.customer_users cu
  where cu.profile_id = p_user_id
    and cu.customer_account_id <> v_customer_account_id;

  update public.profiles
  set workshop_account_id = coalesce(workshop_account_id, v_workshop_account_id),
      display_name = coalesce(nullif(trim(display_name), ''), resolved_display_name),
      full_name = coalesce(nullif(trim(full_name), ''), resolved_display_name),
      phone = coalesce(phone, resolved_phone)
  where id = p_user_id;

  insert into public.customer_users (customer_account_id, profile_id)
  values (v_customer_account_id, p_user_id)
  on conflict (customer_account_id, profile_id) do nothing;

  return v_customer_account_id;
end;
$$;

alter function public.ensure_customer_account_for_user(uuid, text, jsonb) owner to postgres;
