-- Vehicle deletion workflow: soft removal from customer view + workshop export/hard-delete flow.

create table if not exists public.vehicle_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  requested_by_profile_id uuid references public.profiles(id) on delete set null,
  processed_by_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','exported','deleted','cancelled')),
  reason text,
  requested_at timestamptz not null default now(),
  exported_at timestamptz,
  processed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);

alter table if exists public.vehicle_deletion_requests enable row level security;

create unique index if not exists vehicle_deletion_requests_vehicle_pending_idx
  on public.vehicle_deletion_requests(vehicle_id)
  where status in ('pending','exported');

create index if not exists vehicle_deletion_requests_workshop_status_idx
  on public.vehicle_deletion_requests(workshop_account_id, status, requested_at desc);

create index if not exists vehicle_deletion_requests_customer_status_idx
  on public.vehicle_deletion_requests(customer_account_id, status, requested_at desc);

alter table if exists public.vehicle_timeline_events
  drop constraint if exists vehicle_timeline_events_event_type_check;
alter table if exists public.vehicle_timeline_events
  add constraint vehicle_timeline_events_event_type_check
  check (event_type in (
    'vehicle_created',
    'status_changed',
    'doc_uploaded',
    'job_created',
    'job_status_changed',
    'recommendation_added',
    'recommendation_status_changed',
    'ticket_created',
    'message',
    'note',
    'inspection_requested',
    'service_requested',
    'quote_created',
    'quote_status_changed',
    'invoice_created',
    'payment_status_changed',
    'problem_reported',
    'mileage_updated',
    'deletion_requested',
    'deletion_exported',
    'deletion_completed'
  ));

create or replace function public.request_vehicle_deletion(
  p_vehicle_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_customer_account_id uuid;
  v_workshop_account_id uuid;
  v_vehicle record;
  v_request_id uuid;
begin
  if v_profile_id is null then
    raise exception 'Unauthorized';
  end if;

  select cu.customer_account_id
  into v_customer_account_id
  from public.customer_users cu
  where cu.profile_id = v_profile_id
  order by cu.created_at asc
  limit 1;

  if v_customer_account_id is null then
    raise exception 'Customer account not found';
  end if;

  select v.id, v.workshop_account_id, v.current_customer_account_id
  into v_vehicle
  from public.vehicles v
  where v.id = p_vehicle_id;

  if v_vehicle.id is null then
    raise exception 'Vehicle not found';
  end if;

  if v_vehicle.current_customer_account_id is distinct from v_customer_account_id then
    raise exception 'Vehicle is not linked to your account';
  end if;

  v_workshop_account_id := v_vehicle.workshop_account_id;

  insert into public.vehicle_deletion_requests (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    requested_by_profile_id,
    status,
    reason
  )
  values (
    v_workshop_account_id,
    v_customer_account_id,
    p_vehicle_id,
    v_profile_id,
    'pending',
    nullif(trim(coalesce(p_reason, '')), '')
  )
  on conflict (vehicle_id) where status in ('pending','exported') do nothing
  returning id into v_request_id;

  if v_request_id is null then
    raise exception 'A deletion request is already pending for this vehicle';
  end if;

  return v_request_id;
end;
$$;

create or replace function public.handle_vehicle_deletion_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_registration text;
  v_customer_name text;
  v_already_unlinked boolean := false;
begin
  select v.registration_number,
         (v.current_customer_account_id is null or v.current_customer_account_id is distinct from new.customer_account_id)
  into v_registration, v_already_unlinked
  from public.vehicles v
  where v.id = new.vehicle_id;

  select ca.name into v_customer_name
  from public.customer_accounts ca
  where ca.id = new.customer_account_id;

  if not coalesce(v_already_unlinked, true) then
    update public.vehicles
    set current_customer_account_id = null
    where id = new.vehicle_id
      and current_customer_account_id = new.customer_account_id;

    insert into public.vehicle_ownership_history (
      vehicle_id,
      from_customer_account_id,
      to_customer_account_id,
      transferred_by
    )
    values (
      new.vehicle_id,
      new.customer_account_id,
      null,
      new.requested_by_profile_id
    );
  end if;

  insert into public.vehicle_timeline_events (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    actor_profile_id,
    actor_role,
    event_type,
    title,
    description,
    metadata,
    importance
  )
  values (
    new.workshop_account_id,
    new.customer_account_id,
    new.vehicle_id,
    new.requested_by_profile_id,
    'customer',
    'deletion_requested',
    'Vehicle removal requested',
    coalesce(new.reason, 'Customer requested vehicle removal from profile.'),
    jsonb_strip_nulls(jsonb_build_object(
      'deletion_request_id', new.id,
      'vehicle_id', new.vehicle_id,
      'customer_account_id', new.customer_account_id,
      'requested_at', new.requested_at,
      'reason', new.reason
    )),
    'warning'
  );

  perform public.push_notification_to_workshop(
    new.workshop_account_id,
    'system',
    'Vehicle deletion requested',
    format('%s requested deletion for vehicle %s.', coalesce(v_customer_name, 'A customer'), coalesce(v_registration, new.vehicle_id::text)),
    '/workshop/vehicle-deletions',
    jsonb_strip_nulls(jsonb_build_object(
      'deletion_request_id', new.id,
      'vehicle_id', new.vehicle_id,
      'customer_account_id', new.customer_account_id,
      'customer_name', v_customer_name,
      'vehicle_registration', v_registration,
      'reason', new.reason,
      'requested_at', new.requested_at
    ))
  );

  return new;
end;
$$;

drop trigger if exists trg_vehicle_deletion_request_insert on public.vehicle_deletion_requests;
create trigger trg_vehicle_deletion_request_insert
after insert on public.vehicle_deletion_requests
for each row
execute function public.handle_vehicle_deletion_request();

drop policy if exists vehicle_deletion_requests_customer_insert on public.vehicle_deletion_requests;
create policy vehicle_deletion_requests_customer_insert
on public.vehicle_deletion_requests
for insert
to authenticated
with check (
  exists (
    select 1
    from public.customer_users cu
    where cu.profile_id = auth.uid()
      and cu.customer_account_id = vehicle_deletion_requests.customer_account_id
  )
);

drop policy if exists vehicle_deletion_requests_customer_select on public.vehicle_deletion_requests;
create policy vehicle_deletion_requests_customer_select
on public.vehicle_deletion_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.customer_users cu
    where cu.profile_id = auth.uid()
      and cu.customer_account_id = vehicle_deletion_requests.customer_account_id
  )
);

drop policy if exists vehicle_deletion_requests_workshop_select on public.vehicle_deletion_requests;
create policy vehicle_deletion_requests_workshop_select
on public.vehicle_deletion_requests
for select
to authenticated
using (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists vehicle_deletion_requests_workshop_update on public.vehicle_deletion_requests;
create policy vehicle_deletion_requests_workshop_update
on public.vehicle_deletion_requests
for update
to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));

revoke all on function public.request_vehicle_deletion(uuid, text) from public;
grant execute on function public.request_vehicle_deletion(uuid, text) to authenticated;
