alter table public.vehicles
add column if not exists status text not null default 'pending_verification';

drop policy if exists vehicle_ownership_history_select on public.vehicle_ownership_history;

create policy vehicle_ownership_history_select
on public.vehicle_ownership_history
for select
using (
  exists (
    select 1
    from public.vehicles v
    where v.id = vehicle_ownership_history.vehicle_id
      and public.is_customer_of_account(v.current_customer_account_id)
  )
  or public.is_admin()
);

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
  v_customer_account_id uuid;
  v_workshop_account_id uuid;
  v_vehicle_id uuid;
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

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

revoke all on function public.create_customer_vehicle(text, text, text, int, text, int, text) from public;
grant execute on function public.create_customer_vehicle(text, text, text, int, text, int, text) to authenticated;
