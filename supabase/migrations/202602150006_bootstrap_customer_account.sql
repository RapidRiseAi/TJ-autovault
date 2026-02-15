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

  insert into public.profiles (id, role, display_name)
  values (p_user_id, 'customer', resolved_display_name)
  on conflict (id) do nothing;

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

create or replace function public.bootstrap_customer_profile_from_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.ensure_customer_account_for_user(new.id, new.email, new.raw_user_meta_data);
  return new;
end;
$$;

alter function public.bootstrap_customer_profile_from_auth_user() owner to postgres;

drop trigger if exists on_auth_user_created_bootstrap_profile on auth.users;

create trigger on_auth_user_created_bootstrap_profile
after insert on auth.users
for each row
execute function public.bootstrap_customer_profile_from_auth_user();

create or replace function public.create_customer_vehicle(
  p_registration_number text,
  p_make text,
  p_model text,
  p_year int default null,
  p_vin text default null,
  p_odometer_km int default null,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text;
  v_raw_user_meta_data jsonb;
  v_customer_account_id uuid;
  v_workshop_account_id uuid;
  v_vehicle_id uuid;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  select u.email, coalesce(u.raw_user_meta_data, '{}'::jsonb)
  into v_user_email, v_raw_user_meta_data
  from auth.users u
  where u.id = v_user_id;

  perform public.ensure_customer_account_for_user(v_user_id, v_user_email, v_raw_user_meta_data);

  select cu.customer_account_id, ca.workshop_account_id
  into v_customer_account_id, v_workshop_account_id
  from public.customer_users cu
  join public.customer_accounts ca on ca.id = cu.customer_account_id
  where cu.profile_id = v_user_id
  order by cu.created_at asc
  limit 1;

  if v_customer_account_id is null or v_workshop_account_id is null then
    raise exception 'Customer account not found';
  end if;

  insert into public.vehicles (
    workshop_account_id,
    current_customer_account_id,
    registration_number,
    make,
    model,
    year,
    vin,
    odometer_km,
    status
  )
  values (
    v_workshop_account_id,
    v_customer_account_id,
    trim(p_registration_number),
    trim(p_make),
    trim(p_model),
    p_year,
    nullif(trim(coalesce(p_vin, '')), ''),
    p_odometer_km,
    'pending_verification'
  )
  returning id into v_vehicle_id;

  insert into public.vehicle_ownership_history (
    vehicle_id,
    from_customer_account_id,
    to_customer_account_id,
    transferred_by
  )
  values (
    v_vehicle_id,
    null,
    v_customer_account_id,
    v_user_id
  );

  insert into public.timeline_events (
    workshop_account_id,
    vehicle_id,
    actor_profile_id,
    event_type,
    payload
  )
  values (
    v_workshop_account_id,
    v_vehicle_id,
    v_user_id,
    'vehicle_added_by_customer',
    jsonb_build_object(
      'message', 'Vehicle added by customer (pending verification)',
      'notes', nullif(trim(coalesce(p_notes, '')), '')
    )
  );

  return v_vehicle_id;
end;
$$;

alter function public.create_customer_vehicle(text, text, text, int, text, int, text) owner to postgres;

revoke all on function public.create_customer_vehicle(text, text, text, int, text, int, text) from public;
grant execute on function public.create_customer_vehicle(text, text, text, int, text, int, text) to authenticated;
