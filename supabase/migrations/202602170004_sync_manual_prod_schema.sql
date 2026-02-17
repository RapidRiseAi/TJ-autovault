-- Backfill of manual production DB updates that are required by current triggers/UI.

create or replace function public.log_timeline_and_notify()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new jsonb := to_jsonb(new);
  v_old jsonb := to_jsonb(old);
  v_event_type text;
  v_title text;
  v_description text;
  v_workshop uuid;
  v_customer uuid;
  v_vehicle uuid;
  v_href text := '/customer/dashboard';
begin
  if tg_table_name = 'work_requests' and tg_op = 'INSERT' then
    v_event_type := 'inspection_requested';
    if (v_new ->> 'request_type') = 'service' then v_event_type := 'service_requested'; end if;
    v_title := 'New request';
    v_description := coalesce(v_new ->> 'description', v_new ->> 'request_type', 'Request submitted');
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
    v_href := '/workshop/dashboard';
  elsif tg_table_name = 'quotes' and tg_op = 'INSERT' then
    v_event_type := 'quote_created';
    v_title := coalesce(v_new ->> 'quote_number', 'Quote') || ' created';
    v_description := null;
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
  elsif tg_table_name = 'quotes' and tg_op = 'UPDATE' and coalesce(v_old ->> 'status', '') <> coalesce(v_new ->> 'status', '') then
    v_event_type := 'quote_status_changed';
    v_title := 'Quote status updated';
    v_description := coalesce(v_new ->> 'status', 'updated');
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
  elsif tg_table_name = 'invoices' and tg_op = 'INSERT' then
    v_event_type := 'invoice_created';
    v_title := coalesce(v_new ->> 'invoice_number', 'Invoice') || ' created';
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
  elsif tg_table_name = 'invoices' and tg_op = 'UPDATE' and coalesce(v_old ->> 'payment_status', '') <> coalesce(v_new ->> 'payment_status', '') then
    v_event_type := 'payment_status_changed';
    v_title := 'Invoice payment status updated';
    v_description := coalesce(v_new ->> 'payment_status', 'updated');
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
  elsif tg_table_name = 'recommendations' and tg_op = 'INSERT' then
    v_event_type := 'recommendation_added';
    v_title := 'Recommendation added';
    v_description := v_new ->> 'title';
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
  elsif tg_table_name = 'problem_reports' and tg_op = 'INSERT' then
    v_event_type := 'problem_reported';
    v_title := 'Problem report submitted';
    v_description := coalesce(v_new ->> 'description', 'Customer submitted a report');
    v_workshop := (v_new ->> 'workshop_account_id')::uuid;
    v_customer := (v_new ->> 'customer_account_id')::uuid;
    v_vehicle := (v_new ->> 'vehicle_id')::uuid;
    v_href := '/workshop/dashboard';
  else
    return coalesce(new, old);
  end if;

  if v_vehicle is not null and v_event_type is not null then
    insert into public.vehicle_timeline_events (
      workshop_account_id, customer_account_id, vehicle_id, actor_profile_id, actor_role, event_type, title, description, metadata
    ) values (
      v_workshop, v_customer, v_vehicle, auth.uid(), coalesce(public.current_role(), 'system'), v_event_type, v_title, v_description,
      jsonb_build_object('table', tg_table_name, 'op', tg_op)
    );
  end if;

  if tg_table_name in ('quotes','invoices','recommendations') then
    perform public.push_notification(v_workshop, v_customer, case when tg_table_name='invoices' then 'invoice' when tg_table_name='quotes' then 'quote' else 'system' end, v_title, v_description, v_href);
  elsif tg_table_name = 'work_requests' then
    perform public.push_notification(v_workshop, v_customer, 'request', 'Request received', v_title, '/customer/vehicles/' || (v_new ->> 'vehicle_id'));
  elsif tg_table_name = 'problem_reports' then
    perform public.push_notification(v_workshop, v_customer, 'report', 'Problem report submitted', v_description, '/customer/vehicles/' || (v_new ->> 'vehicle_id'));
  end if;

  return coalesce(new, old);
end;
$$;

do $$
declare
  constraint_name text;
begin
  select c.conname
  into constraint_name
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'vehicle_timeline_events'
    and c.contype = 'c'
    and pg_get_constraintdef(c.oid) ilike '%event_type%';

  if constraint_name is not null then
    execute format('alter table public.vehicle_timeline_events drop constraint if exists %I', constraint_name);
  end if;

  alter table public.vehicle_timeline_events
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
      'problem_reported'
    ));
exception
  when duplicate_object then
    null;
end $$;
