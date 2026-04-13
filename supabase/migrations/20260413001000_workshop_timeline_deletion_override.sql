create or replace function public.workshop_override_timeline_item_deletion(
  p_target_kind text,
  p_target_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid := auth.uid();
  v_profile_role public.user_role;
  v_profile_workshop_account_id uuid;
  v_vehicle_id uuid;
  v_workshop_account_id uuid;
  v_customer_account_id uuid;
  v_reason text;
  v_target_title text;
begin
  if v_profile_id is null then
    raise exception 'Unauthorized';
  end if;

  select p.role, p.workshop_account_id
  into v_profile_role, v_profile_workshop_account_id
  from public.profiles p
  where p.id = v_profile_id;

  if v_profile_role not in ('admin', 'technician') then
    raise exception 'Only workshop users can override timeline deletion';
  end if;

  if p_target_kind = 'timeline' then
    select e.vehicle_id, e.workshop_account_id, e.customer_account_id, e.title
    into v_vehicle_id, v_workshop_account_id, v_customer_account_id, v_target_title
    from public.vehicle_timeline_events e
    where e.id = p_target_id
    for update;
  elsif p_target_kind = 'document' then
    select d.vehicle_id, d.workshop_account_id, d.customer_account_id,
      coalesce(d.subject, d.original_name, 'Document')
    into v_vehicle_id, v_workshop_account_id, v_customer_account_id, v_target_title
    from public.vehicle_documents d
    where d.id = p_target_id
    for update;
  else
    raise exception 'Unsupported target kind';
  end if;

  if v_vehicle_id is null then
    raise exception 'Timeline item not found';
  end if;

  if v_profile_workshop_account_id is distinct from v_workshop_account_id then
    raise exception 'You do not have access to this vehicle';
  end if;

  v_reason := nullif(trim(coalesce(p_reason, '')), '');

  if p_target_kind = 'timeline' then
    delete from public.vehicle_timeline_events where id = p_target_id;
  else
    delete from public.vehicle_documents where id = p_target_id;
    delete from public.vehicle_timeline_events
    where vehicle_id = v_vehicle_id
      and event_type = 'doc_uploaded'
      and metadata ->> 'doc_id' = p_target_id::text;
  end if;

  update public.timeline_deletion_requests
  set status = 'approved',
      approver_profile_id = v_profile_id,
      approver_note = coalesce(v_reason, 'Workshop override deletion'),
      processed_at = now()
  where vehicle_id = v_vehicle_id
    and target_kind = p_target_kind
    and target_id = p_target_id
    and status = 'pending';

  insert into public.vehicle_timeline_events (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    actor_profile_id,
    actor_role,
    event_type,
    title,
    description,
    importance,
    metadata
  )
  values (
    v_workshop_account_id,
    v_customer_account_id,
    v_vehicle_id,
    v_profile_id,
    'workshop',
    'note',
    'Item deleted by workshop override',
    coalesce(v_reason, 'No reason provided') || ' · Deleted item: ' || coalesce(v_target_title, p_target_kind || ' item'),
    'warning',
    jsonb_build_object(
      'source', 'workshop_override_deletion',
      'deleted_target_kind', p_target_kind,
      'deleted_target_id', p_target_id,
      'deleted_target_title', v_target_title,
      'reason', v_reason
    )
  );
end;
$$;

revoke all on function public.workshop_override_timeline_item_deletion(text, uuid, text) from public;
grant execute on function public.workshop_override_timeline_item_deletion(text, uuid, text) to authenticated;
