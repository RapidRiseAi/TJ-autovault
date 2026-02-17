create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_workshop_account_id uuid;
  v_customer_account_id uuid;
begin
  v_workshop_account_id := coalesce(
    nullif(v_new ->> 'workshop_account_id', '')::uuid,
    nullif(v_old ->> 'workshop_account_id', '')::uuid
  );

  v_customer_account_id := coalesce(
    nullif(v_new ->> 'customer_account_id', '')::uuid,
    nullif(v_old ->> 'customer_account_id', '')::uuid,
    nullif(v_new ->> 'current_customer_account_id', '')::uuid,
    nullif(v_old ->> 'current_customer_account_id', '')::uuid,
    nullif(v_new ->> 'to_customer_account_id', '')::uuid,
    nullif(v_old ->> 'to_customer_account_id', '')::uuid
  );

  insert into public.audit_log (
    workshop_account_id,
    customer_account_id,
    actor_profile_id,
    actor_role,
    entity_type,
    entity_id,
    action,
    old_data,
    new_data
  ) values (
    v_workshop_account_id,
    v_customer_account_id,
    auth.uid(),
    public.get_my_role_text(),
    tg_table_name,
    coalesce(nullif(v_new ->> 'id', '')::uuid, nullif(v_old ->> 'id', '')::uuid),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then v_old else null end,
    case when tg_op in ('INSERT','UPDATE') then v_new else null end
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.create_support_ticket_with_timeline(
  p_workshop_account_id uuid,
  p_customer_account_id uuid,
  p_vehicle_id uuid,
  p_category text,
  p_message text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket_id uuid;
begin
  insert into public.support_tickets (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    category,
    message
  )
  values (
    p_workshop_account_id,
    p_customer_account_id,
    p_vehicle_id,
    p_category,
    p_message
  )
  returning id into v_ticket_id;

  if p_vehicle_id is not null then
    perform public.add_vehicle_timeline_event(
      p_workshop_account_id,
      p_customer_account_id,
      p_vehicle_id,
      'ticket_created',
      'Support ticket created',
      p_message,
      jsonb_build_object('ticket_id', v_ticket_id)
    );
  end if;

  return v_ticket_id;
end;
$$;
