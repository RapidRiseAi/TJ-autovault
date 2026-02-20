create or replace function public.request_timeline_item_deletion(
  p_target_kind text,
  p_target_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_profile_role public.user_role;
  v_profile_workshop_account_id uuid;
  v_customer_account_id uuid;
  v_workshop_account_id uuid;
  v_vehicle_id uuid;
  v_requester_role text;
  v_request_id uuid;
begin
  if v_profile_id is null then
    raise exception 'Unauthorized';
  end if;

  select p.role, p.workshop_account_id
  into v_profile_role, v_profile_workshop_account_id
  from public.profiles p
  where p.id = v_profile_id;

  if p_target_kind = 'timeline' then
    select e.vehicle_id, e.workshop_account_id, e.customer_account_id
    into v_vehicle_id, v_workshop_account_id, v_customer_account_id
    from public.vehicle_timeline_events e
    where e.id = p_target_id;
  elsif p_target_kind = 'document' then
    select d.vehicle_id, d.workshop_account_id, d.customer_account_id
    into v_vehicle_id, v_workshop_account_id, v_customer_account_id
    from public.vehicle_documents d
    where d.id = p_target_id;
  else
    raise exception 'Unsupported target kind';
  end if;

  if v_vehicle_id is null then
    raise exception 'Timeline item not found';
  end if;

  if exists (
    select 1
    from public.customer_users cu
    where cu.profile_id = v_profile_id
      and cu.customer_account_id = v_customer_account_id
  ) then
    v_requester_role := 'customer';
  elsif v_profile_role in ('admin', 'technician')
    and v_profile_workshop_account_id = v_workshop_account_id then
    v_requester_role := 'workshop';
  else
    raise exception 'You do not have access to this vehicle';
  end if;

  insert into public.timeline_deletion_requests (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    target_kind,
    target_id,
    requested_by_profile_id,
    requested_by_role,
    reason,
    status
  )
  values (
    v_workshop_account_id,
    v_customer_account_id,
    v_vehicle_id,
    p_target_kind,
    p_target_id,
    v_profile_id,
    v_requester_role,
    nullif(trim(coalesce(p_reason, '')), ''),
    'pending'
  )
  on conflict (vehicle_id, target_kind, target_id) where status = 'pending' do nothing
  returning id into v_request_id;

  if v_request_id is null then
    raise exception 'A pending deletion request already exists for this item';
  end if;

  return v_request_id;
end;
$$;

create or replace function public.review_timeline_item_deletion(
  p_request_id uuid,
  p_approve boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_request public.timeline_deletion_requests%rowtype;
  v_profile_role public.user_role;
  v_profile_workshop_account_id uuid;
  v_actor_role text;
begin
  if v_profile_id is null then
    raise exception 'Unauthorized';
  end if;

  select p.role, p.workshop_account_id
  into v_profile_role, v_profile_workshop_account_id
  from public.profiles p
  where p.id = v_profile_id;

  select *
  into v_request
  from public.timeline_deletion_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'Request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'Request has already been processed';
  end if;

  if exists (
    select 1
    from public.customer_users cu
    where cu.profile_id = v_profile_id
      and cu.customer_account_id = v_request.customer_account_id
  ) then
    v_actor_role := 'customer';
  elsif v_profile_role in ('admin', 'technician')
    and v_profile_workshop_account_id = v_request.workshop_account_id then
    v_actor_role := 'workshop';
  else
    raise exception 'You do not have access to this request';
  end if;

  if v_actor_role = v_request.requested_by_role then
    raise exception 'The other party must review this request';
  end if;

  update public.timeline_deletion_requests
  set status = case when p_approve then 'approved' else 'rejected' end,
      approver_profile_id = v_profile_id,
      approver_note = nullif(trim(coalesce(p_note, '')), ''),
      processed_at = now()
  where id = p_request_id;

  if p_approve then
    if v_request.target_kind = 'timeline' then
      delete from public.vehicle_timeline_events where id = v_request.target_id;
    else
      delete from public.vehicle_documents where id = v_request.target_id;
      delete from public.vehicle_timeline_events
      where vehicle_id = v_request.vehicle_id
        and event_type = 'doc_uploaded'
        and metadata ->> 'doc_id' = v_request.target_id::text;
    end if;
  end if;
end;
$$;

drop policy if exists timeline_deletion_requests_select_workshop on public.timeline_deletion_requests;
create policy timeline_deletion_requests_select_workshop
on public.timeline_deletion_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'technician')
      and p.workshop_account_id = timeline_deletion_requests.workshop_account_id
  )
);

