alter type public.user_role add value if not exists 'inactive_technician';

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
  resolved_account_name text;
  resolved_role text;
  v_customer_account_id uuid;
begin
  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  resolved_display_name := coalesce(
    nullif(trim(p_raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Customer'
  );

  resolved_account_name := coalesce(
    nullif(resolved_display_name, ''),
    nullif(split_part(coalesce(p_email, ''), '@', 1), ''),
    'Customer'
  );

  resolved_role := lower(coalesce(nullif(trim(p_raw_user_meta_data ->> 'role'), ''), 'customer'));
  if resolved_role not in ('admin', 'technician', 'customer', 'inactive_technician') then
    resolved_role := 'customer';
  end if;

  insert into public.profiles (id, role, display_name)
  values (p_user_id, resolved_role::public.user_role, resolved_display_name)
  on conflict (id)
  do update
  set display_name = coalesce(
      nullif(trim(excluded.display_name), ''),
      public.profiles.display_name
    ),
    role = case
      when public.profiles.role = 'customer' and excluded.role <> 'customer' then excluded.role
      else public.profiles.role
    end;

  if resolved_role <> 'customer' then
    return null;
  end if;

  select cu.customer_account_id
  into v_customer_account_id
  from public.customer_users cu
  where cu.profile_id = p_user_id
  order by cu.created_at asc
  limit 1;

  if v_customer_account_id is null then
    insert into public.customer_accounts (workshop_account_id, name, tier)
    values ('11111111-1111-1111-1111-111111111111', resolved_account_name, 'free')
    returning id into v_customer_account_id;

    insert into public.customer_users (customer_account_id, profile_id)
    values (v_customer_account_id, p_user_id)
    on conflict (customer_account_id, profile_id) do nothing;

    select cu.customer_account_id
    into v_customer_account_id
    from public.customer_users cu
    where cu.profile_id = p_user_id
    order by cu.created_at asc
    limit 1;
  end if;

  return v_customer_account_id;
end;
$$;

alter function public.ensure_customer_account_for_user(uuid, text, jsonb) owner to postgres;
