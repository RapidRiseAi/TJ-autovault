-- Richer notification payloads and workshop profile notification helper.

alter table if exists public.notifications
  add column if not exists data jsonb not null default '{}'::jsonb;

create or replace function public.push_notification(
  p_workshop_account_id uuid,
  p_to_customer_account_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(workshop_account_id,to_profile_id,to_customer_account_id,kind,title,body,href,data)
  values (
    p_workshop_account_id,
    (
      select cu.profile_id
      from public.customer_users cu
      where cu.customer_account_id = p_to_customer_account_id
      order by cu.created_at asc
      limit 1
    ),
    p_to_customer_account_id,
    p_kind,
    p_title,
    p_body,
    p_href,
    coalesce(p_data, '{}'::jsonb)
  );
end;
$$;

create or replace function public.push_notification_to_profile(
  p_workshop_account_id uuid,
  p_to_profile_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(workshop_account_id,to_profile_id,to_customer_account_id,kind,title,body,href,data)
  values (
    p_workshop_account_id,
    p_to_profile_id,
    null,
    p_kind,
    p_title,
    p_body,
    p_href,
    coalesce(p_data, '{}'::jsonb)
  );
end;
$$;

create or replace function public.push_notification_to_workshop(
  p_workshop_account_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.role = 'admin'
    and p.workshop_account_id = p_workshop_account_id
  order by p.created_at asc
  limit 1;

  if v_profile_id is null then
    return;
  end if;

  perform public.push_notification_to_profile(
    p_workshop_account_id,
    v_profile_id,
    p_kind,
    p_title,
    p_body,
    p_href,
    p_data
  );
end;
$$;

create or replace function public.notify_workshop_on_customer_actions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text;
  v_title text;
  v_body text;
  v_kind text;
  v_href text;
  v_profile_id uuid;
  v_customer_name text;
  v_vehicle_registration text;
  v_data jsonb := '{}'::jsonb;
begin
  v_status := coalesce(new.status::text, '');
  if tg_op <> 'UPDATE' or coalesce(old.status::text, '') = v_status or v_status not in ('approved', 'declined') then
    return new;
  end if;

  select ca.name, v.registration_number
  into v_customer_name, v_vehicle_registration
  from public.customer_accounts ca
  left join public.vehicles v on v.id = new.vehicle_id
  where ca.id = new.customer_account_id;

  select p.id
  into v_profile_id
  from public.profiles p
  where p.role = 'admin'
    and p.workshop_account_id = new.workshop_account_id
  order by p.created_at asc
  limit 1;

  v_data := jsonb_strip_nulls(jsonb_build_object(
    'customer_account_id', new.customer_account_id,
    'vehicle_id', new.vehicle_id,
    'customer_name', v_customer_name,
    'vehicle_registration', v_vehicle_registration,
    'status', v_status,
    'source_table', tg_table_name,
    'source_id', new.id
  ));

  if tg_table_name = 'quotes' then
    v_kind := 'quote';
    v_title := 'Quote ' || v_status;
    v_body := format(
      'Customer %s %s quote %s for vehicle %s.',
      coalesce(v_customer_name, 'Unknown customer'),
      v_status,
      coalesce(new.quote_number, new.id::text),
      coalesce(v_vehicle_registration, 'Unknown registration')
    );
    v_href := '/workshop/vehicles/' || new.vehicle_id::text;
    v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
      'quote_id', new.id,
      'quote_number', new.quote_number,
      'customer_decision_reason', new.customer_decision_reason,
      'customer_decision_at', new.customer_decision_at
    ));
  elsif tg_table_name = 'recommendations' then
    v_kind := 'system';
    v_title := 'Recommendation ' || v_status;
    v_body := format(
      'Customer %s %s recommendation "%s" for vehicle %s.',
      coalesce(v_customer_name, 'Unknown customer'),
      v_status,
      coalesce(new.title, new.id::text),
      coalesce(v_vehicle_registration, 'Unknown registration')
    );
    v_href := '/workshop/vehicles/' || new.vehicle_id::text;
    v_data := v_data || jsonb_strip_nulls(jsonb_build_object(
      'recommendation_id', new.id,
      'recommendation_title', new.title
    ));
  else
    return new;
  end if;

  if v_profile_id is not null then
    perform public.push_notification_to_profile(new.workshop_account_id, v_profile_id, v_kind, v_title, v_body, v_href, v_data);
  end if;

  return new;
end;
$$;
