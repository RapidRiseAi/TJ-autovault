-- Customer <-> Workshop messaging threads with notification and timeline integration.

create table if not exists public.message_conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  subject text not null
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  in_reply_to_message_id uuid references public.messages(id) on delete set null,
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  subject text,
  body text not null,
  sender_profile_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('customer','admin','technician'))
);

create table if not exists public.message_document_history (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.message_conversations(id) on delete cascade,
  message_id uuid not null references public.messages(id) on delete cascade,
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  customer_account_id uuid not null references public.customer_accounts(id) on delete cascade,
  note text not null
);

create index if not exists message_conversations_workshop_created_idx on public.message_conversations(workshop_account_id, created_at desc);
create index if not exists message_conversations_customer_created_idx on public.message_conversations(customer_account_id, created_at desc);
create index if not exists message_conversations_vehicle_created_idx on public.message_conversations(vehicle_id, created_at desc);
create index if not exists messages_workshop_created_idx on public.messages(workshop_account_id, created_at desc);
create index if not exists messages_customer_created_idx on public.messages(customer_account_id, created_at desc);
create index if not exists messages_vehicle_created_idx on public.messages(vehicle_id, created_at desc);
create index if not exists messages_conversation_created_idx on public.messages(conversation_id, created_at asc);

alter table if exists public.vehicle_timeline_events drop constraint if exists vehicle_timeline_events_event_type_check;
alter table if exists public.vehicle_timeline_events
  add constraint vehicle_timeline_events_event_type_check
  check (event_type in (
    'vehicle_created','status_changed','doc_uploaded','job_created','job_status_changed','recommendation_added','recommendation_status_changed','ticket_created','message','note','inspection_requested','service_requested','quote_created','quote_status_changed','invoice_created','payment_status_changed','problem_reported','deletion_requested','deletion_reviewed','manual_log','message_sent','message_reply'
  ));

alter table if exists public.message_conversations enable row level security;
alter table if exists public.messages enable row level security;
alter table if exists public.message_document_history enable row level security;

drop policy if exists message_conversations_select on public.message_conversations;
create policy message_conversations_select on public.message_conversations
for select to authenticated
using (
  public.is_customer_of_account(customer_account_id)
  or public.is_workshop_staff_for(workshop_account_id)
);

drop policy if exists messages_select on public.messages;
create policy messages_select on public.messages
for select to authenticated
using (
  public.is_customer_of_account(customer_account_id)
  or public.is_workshop_staff_for(workshop_account_id)
);

drop policy if exists message_document_history_select on public.message_document_history;
create policy message_document_history_select on public.message_document_history
for select to authenticated
using (
  public.is_customer_of_account(customer_account_id)
  or public.is_workshop_staff_for(workshop_account_id)
);

create or replace function public.create_message_thread_entry(
  p_customer_account_id uuid,
  p_workshop_account_id uuid default null,
  p_vehicle_id uuid default null,
  p_subject text default '',
  p_body text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_profile_id uuid := auth.uid();
  v_sender_role text;
  v_workshop_account_id uuid;
  v_customer_account_id uuid;
  v_vehicle_id uuid := p_vehicle_id;
  v_subject text := trim(coalesce(p_subject, ''));
  v_body text := trim(coalesce(p_body, ''));
  v_conversation_id uuid;
  v_message_id uuid;
  v_vehicle_registration text;
begin
  if v_sender_profile_id is null then raise exception 'Not authenticated'; end if;
  if v_subject = '' or v_body = '' then raise exception 'Subject and body are required'; end if;

  select p.role::text, p.workshop_account_id into v_sender_role, v_workshop_account_id
  from public.profiles p where p.id = v_sender_profile_id;

  if v_sender_role in ('admin','technician') then
    v_workshop_account_id := coalesce(v_workshop_account_id, p_workshop_account_id);
    v_customer_account_id := p_customer_account_id;
    if v_workshop_account_id is null then raise exception 'Workshop account is required'; end if;
    if not public.is_workshop_staff_for(v_workshop_account_id) then raise exception 'Not allowed'; end if;
  else
    v_sender_role := 'customer';
    v_customer_account_id := public.current_customer_account_id();
    if v_customer_account_id is null then raise exception 'Customer account not found'; end if;
    if v_customer_account_id <> p_customer_account_id then raise exception 'Not allowed'; end if;
    select ca.workshop_account_id into v_workshop_account_id from public.customer_accounts ca where ca.id = v_customer_account_id;
  end if;

  if not exists (select 1 from public.customer_accounts ca where ca.id = v_customer_account_id and ca.workshop_account_id = v_workshop_account_id) then
    raise exception 'Customer/workshop mismatch';
  end if;

  if v_vehicle_id is not null then
    if not exists (
      select 1 from public.vehicles v
      where v.id = v_vehicle_id
        and v.workshop_account_id = v_workshop_account_id
        and v.current_customer_account_id = v_customer_account_id
    ) then
      raise exception 'Vehicle is not linked to this customer/workshop';
    end if;
  end if;

  insert into public.message_conversations (workshop_account_id, customer_account_id, vehicle_id, subject)
  values (v_workshop_account_id, v_customer_account_id, v_vehicle_id, v_subject)
  returning id into v_conversation_id;

  insert into public.messages (conversation_id, in_reply_to_message_id, workshop_account_id, customer_account_id, vehicle_id, subject, body, sender_profile_id, sender_role)
  values (v_conversation_id, null, v_workshop_account_id, v_customer_account_id, v_vehicle_id, v_subject, v_body, v_sender_profile_id, v_sender_role)
  returning id into v_message_id;

  if v_vehicle_id is not null then
    insert into public.vehicle_timeline_events (workshop_account_id, customer_account_id, vehicle_id, event_type, title, body, actor_profile_id, actor_role, metadata)
    values (v_workshop_account_id, v_customer_account_id, v_vehicle_id, 'message_sent', v_subject, v_body, v_sender_profile_id, v_sender_role, jsonb_build_object('conversation_id', v_conversation_id, 'message_id', v_message_id));
  else
    insert into public.message_document_history (conversation_id, message_id, workshop_account_id, customer_account_id, note)
    values (v_conversation_id, v_message_id, v_workshop_account_id, v_customer_account_id, v_body);
  end if;

  select v.registration_number into v_vehicle_registration from public.vehicles v where v.id = v_vehicle_id;

  if v_sender_role = 'customer' then
    perform public.push_notification_to_workshop(
      v_workshop_account_id,
      'message',
      'New customer message',
      left(v_body, 180),
      '/workshop/notifications?messageThread=' || v_conversation_id::text,
      jsonb_strip_nulls(jsonb_build_object('message_thread_id', v_conversation_id, 'message_id', v_message_id, 'vehicle_id', v_vehicle_id, 'vehicle_registration', v_vehicle_registration))
    );
  else
    perform public.push_notification(
      v_workshop_account_id,
      v_customer_account_id,
      'message',
      'New workshop message',
      left(v_body, 180),
      '/customer/notifications?messageThread=' || v_conversation_id::text,
      jsonb_strip_nulls(jsonb_build_object('message_thread_id', v_conversation_id, 'message_id', v_message_id, 'vehicle_id', v_vehicle_id, 'vehicle_registration', v_vehicle_registration))
    );
  end if;

  return jsonb_build_object('conversation_id', v_conversation_id, 'message_id', v_message_id, 'vehicle_id', v_vehicle_id);
end;
$$;

create or replace function public.reply_to_message_thread(
  p_conversation_id uuid,
  p_body text,
  p_in_reply_to_message_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender_profile_id uuid := auth.uid();
  v_sender_role text;
  v_conversation public.message_conversations%rowtype;
  v_message_id uuid;
  v_vehicle_registration text;
begin
  if v_sender_profile_id is null then raise exception 'Not authenticated'; end if;

  select * into v_conversation from public.message_conversations where id = p_conversation_id;
  if v_conversation.id is null then raise exception 'Conversation not found'; end if;

  select p.role::text into v_sender_role from public.profiles p where p.id = v_sender_profile_id;
  if v_sender_role in ('admin','technician') then
    if not public.is_workshop_staff_for(v_conversation.workshop_account_id) then raise exception 'Not allowed'; end if;
  else
    v_sender_role := 'customer';
    if not public.is_customer_of_account(v_conversation.customer_account_id) then raise exception 'Not allowed'; end if;
  end if;

  insert into public.messages (conversation_id, in_reply_to_message_id, workshop_account_id, customer_account_id, vehicle_id, subject, body, sender_profile_id, sender_role)
  values (v_conversation.id, p_in_reply_to_message_id, v_conversation.workshop_account_id, v_conversation.customer_account_id, v_conversation.vehicle_id, v_conversation.subject, trim(coalesce(p_body,'')), v_sender_profile_id, v_sender_role)
  returning id into v_message_id;

  update public.message_conversations set updated_at = now() where id = v_conversation.id;

  if v_conversation.vehicle_id is not null then
    insert into public.vehicle_timeline_events (workshop_account_id, customer_account_id, vehicle_id, event_type, title, body, actor_profile_id, actor_role, metadata)
    values (v_conversation.workshop_account_id, v_conversation.customer_account_id, v_conversation.vehicle_id, 'message_reply', v_conversation.subject, p_body, v_sender_profile_id, v_sender_role, jsonb_build_object('conversation_id', v_conversation.id, 'message_id', v_message_id));
  else
    insert into public.message_document_history (conversation_id, message_id, workshop_account_id, customer_account_id, note)
    values (v_conversation.id, v_message_id, v_conversation.workshop_account_id, v_conversation.customer_account_id, trim(coalesce(p_body,'')));
  end if;

  select v.registration_number into v_vehicle_registration from public.vehicles v where v.id = v_conversation.vehicle_id;

  if v_sender_role = 'customer' then
    perform public.push_notification_to_workshop(
      v_conversation.workshop_account_id,
      'message',
      'Customer replied',
      left(p_body, 180),
      '/workshop/notifications?messageThread=' || v_conversation.id::text,
      jsonb_strip_nulls(jsonb_build_object('message_thread_id', v_conversation.id, 'message_id', v_message_id, 'vehicle_id', v_conversation.vehicle_id, 'vehicle_registration', v_vehicle_registration))
    );
  else
    perform public.push_notification(
      v_conversation.workshop_account_id,
      v_conversation.customer_account_id,
      'message',
      'Workshop replied',
      left(p_body, 180),
      '/customer/notifications?messageThread=' || v_conversation.id::text,
      jsonb_strip_nulls(jsonb_build_object('message_thread_id', v_conversation.id, 'message_id', v_message_id, 'vehicle_id', v_conversation.vehicle_id, 'vehicle_registration', v_vehicle_registration))
    );
  end if;

  return jsonb_build_object('conversation_id', v_conversation.id, 'message_id', v_message_id, 'vehicle_id', v_conversation.vehicle_id);
end;
$$;

grant execute on function public.create_message_thread_entry(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.reply_to_message_thread(uuid, text, uuid) to authenticated;
