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
  v_reason text;
  v_data jsonb;
  v_vehicle_registration text;
  v_customer_name text;
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

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

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
    v_reason,
    'pending'
  )
  on conflict (vehicle_id, target_kind, target_id) where status = 'pending' do nothing
  returning id into v_request_id;

  if v_request_id is null then
    raise exception 'A pending deletion request already exists for this item';
  end if;

  select v.registration_number, ca.name
  into v_vehicle_registration, v_customer_name
  from public.vehicles v
  left join public.customer_accounts ca on ca.id = v_customer_account_id
  where v.id = v_vehicle_id;

  v_data := jsonb_strip_nulls(
    jsonb_build_object(
      'request_id', v_request_id,
      'vehicle_id', v_vehicle_id,
      'target_kind', p_target_kind,
      'actor_role', v_requester_role,
      'reason', v_reason,
      'customer_account_id', v_customer_account_id,
      'vehicle_registration', v_vehicle_registration,
      'customer_name', v_customer_name
    )
  );

  if v_requester_role = 'customer' then
    perform public.push_notification_to_workshop(
      v_workshop_account_id,
      'request',
      'Timeline deletion request pending review',
      coalesce(v_reason, 'A customer requested timeline item deletion approval.'),
      '/workshop/vehicles/' || v_vehicle_id::text || '/timeline?deletionRequest=' || v_request_id::text,
      v_data
    );
  else
    perform public.push_notification(
      v_workshop_account_id,
      v_customer_account_id,
      'request',
      'Timeline deletion request pending review',
      coalesce(v_reason, 'Your workshop requested timeline item deletion approval.'),
      '/customer/vehicles/' || v_vehicle_id::text || '/timeline?deletionRequest=' || v_request_id::text,
      v_data
    );
  end if;

  return v_request_id;
end;
$$;
