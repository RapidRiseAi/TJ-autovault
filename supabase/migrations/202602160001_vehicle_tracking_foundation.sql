create table if not exists public.service_jobs (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  vehicle_id uuid not null references public.vehicles(id),
  status text not null default 'open' check (status in ('open','awaiting_approval','in_progress','completed','cancelled')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  odometer_km int,
  complaint text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists service_jobs_vehicle_id_idx on public.service_jobs(vehicle_id);
create index if not exists service_jobs_customer_account_id_idx on public.service_jobs(customer_account_id);
create index if not exists service_jobs_workshop_account_id_idx on public.service_jobs(workshop_account_id);
create index if not exists service_jobs_status_idx on public.service_jobs(status);

create table if not exists public.service_recommendations (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  vehicle_id uuid not null references public.vehicles(id),
  service_job_id uuid references public.service_jobs(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  status text not null default 'pending' check (status in ('pending','approved','declined','completed')),
  customer_note text,
  created_at timestamptz not null default now()
);

create index if not exists service_recommendations_vehicle_id_idx on public.service_recommendations(vehicle_id);
create index if not exists service_recommendations_customer_account_id_idx on public.service_recommendations(customer_account_id);
create index if not exists service_recommendations_workshop_account_id_idx on public.service_recommendations(workshop_account_id);
create index if not exists service_recommendations_status_idx on public.service_recommendations(status);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  vehicle_id uuid references public.vehicles(id),
  category text not null check (category in ('account','vehicle','service','billing','other')),
  message text not null,
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  created_at timestamptz not null default now()
);

create index if not exists support_tickets_workshop_account_id_idx on public.support_tickets(workshop_account_id);
create index if not exists support_tickets_customer_account_id_idx on public.support_tickets(customer_account_id);
create index if not exists support_tickets_vehicle_id_idx on public.support_tickets(vehicle_id);
create index if not exists support_tickets_status_idx on public.support_tickets(status);

create table if not exists public.vehicle_documents (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  vehicle_id uuid not null references public.vehicles(id),
  doc_type text not null check (doc_type in ('vehicle_photo','license_disk','invoice','report_photo','other')),
  storage_bucket text not null,
  storage_path text not null,
  original_name text,
  mime_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists vehicle_documents_vehicle_id_idx on public.vehicle_documents(vehicle_id);
create index if not exists vehicle_documents_customer_account_id_idx on public.vehicle_documents(customer_account_id);
create index if not exists vehicle_documents_workshop_account_id_idx on public.vehicle_documents(workshop_account_id);
create index if not exists vehicle_documents_doc_type_idx on public.vehicle_documents(doc_type);

create table if not exists public.vehicle_timeline_events (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  vehicle_id uuid not null references public.vehicles(id),
  event_type text not null check (event_type in ('vehicle_created','status_changed','doc_uploaded','job_created','job_status_changed','recommendation_added','recommendation_status_changed','ticket_created','message','note')),
  title text not null,
  body text,
  actor_profile_id uuid references public.profiles(id),
  actor_role text,
  meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_timeline_events_vehicle_id_idx on public.vehicle_timeline_events(vehicle_id);
create index if not exists vehicle_timeline_events_workshop_account_id_idx on public.vehicle_timeline_events(workshop_account_id);
create index if not exists vehicle_timeline_events_customer_account_id_idx on public.vehicle_timeline_events(customer_account_id);
create index if not exists vehicle_timeline_events_event_type_idx on public.vehicle_timeline_events(event_type);
create index if not exists vehicle_timeline_events_created_at_idx on public.vehicle_timeline_events(created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid references public.workshop_accounts(id),
  customer_account_id uuid references public.customer_accounts(id),
  actor_profile_id uuid references public.profiles(id),
  actor_role text,
  entity_type text not null check (entity_type in ('vehicles','service_jobs','service_recommendations','support_tickets','vehicle_documents')),
  entity_id uuid not null,
  action text not null check (action in ('insert','update','delete')),
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_workshop_account_id_idx on public.audit_log(workshop_account_id);
create index if not exists audit_log_customer_account_id_idx on public.audit_log(customer_account_id);
create index if not exists audit_log_entity_type_idx on public.audit_log(entity_type);
create index if not exists audit_log_entity_id_idx on public.audit_log(entity_id);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

alter table public.vehicles add column if not exists vehicle_image_doc_id uuid references public.vehicle_documents(id) on delete set null;
alter table public.vehicles add column if not exists last_service_at timestamptz;
alter table public.vehicles add column if not exists next_service_due_at timestamptz;
alter table public.vehicles add column if not exists next_service_due_km int;
alter table public.vehicles add column if not exists status text not null default 'pending_verification';

create or replace function public.get_my_workshop_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.workshop_account_id from public.profiles p where p.id = auth.uid() limit 1;
$$;

create or replace function public.get_my_role_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text from public.profiles p where p.id = auth.uid() limit 1;
$$;

create or replace function public.add_vehicle_timeline_event(
  p_workshop_account_id uuid,
  p_customer_account_id uuid,
  p_vehicle_id uuid,
  p_event_type text,
  p_title text,
  p_body text default null,
  p_meta jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
begin
  insert into public.vehicle_timeline_events (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    event_type,
    title,
    body,
    actor_profile_id,
    actor_role,
    meta
  ) values (
    p_workshop_account_id,
    p_customer_account_id,
    p_vehicle_id,
    p_event_type,
    p_title,
    p_body,
    auth.uid(),
    public.get_my_role_text(),
    p_meta
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.create_vehicle_with_ownership_and_timeline(
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
  v_vehicle_id uuid;
  v_customer_account_id uuid;
  v_workshop_account_id uuid;
begin
  select ca.id, ca.workshop_account_id
  into v_customer_account_id, v_workshop_account_id
  from public.customer_accounts ca
  where ca.auth_user_id = auth.uid()
  order by ca.created_at asc
  limit 1;

  if v_customer_account_id is null then
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
  ) values (
    v_workshop_account_id,
    v_customer_account_id,
    trim(p_registration_number),
    trim(p_make),
    trim(p_model),
    p_year,
    nullif(trim(coalesce(p_vin, '')), ''),
    p_odometer_km,
    'pending_verification'
  ) returning id into v_vehicle_id;

  insert into public.vehicle_ownership_history (vehicle_id, from_customer_account_id, to_customer_account_id, transferred_by)
  values (v_vehicle_id, null, v_customer_account_id, auth.uid());

  perform public.add_vehicle_timeline_event(
    v_workshop_account_id,
    v_customer_account_id,
    v_vehicle_id,
    'vehicle_created',
    'Vehicle added',
    nullif(trim(coalesce(p_notes,'')),''),
    null
  );

  return v_vehicle_id;
end;
$$;

create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workshop_account_id uuid;
  v_customer_account_id uuid;
begin
  if tg_op = 'DELETE' then
    v_workshop_account_id := old.workshop_account_id;
    v_customer_account_id := old.customer_account_id;
  else
    v_workshop_account_id := coalesce(new.workshop_account_id, old.workshop_account_id);
    v_customer_account_id := coalesce(new.customer_account_id, old.customer_account_id, new.current_customer_account_id, old.current_customer_account_id);
  end if;

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
    coalesce(new.id, old.id),
    lower(tg_op),
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_audit_vehicles on public.vehicles;
create trigger trg_audit_vehicles after insert or update or delete on public.vehicles for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_service_jobs on public.service_jobs;
create trigger trg_audit_service_jobs after insert or update or delete on public.service_jobs for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_service_recommendations on public.service_recommendations;
create trigger trg_audit_service_recommendations after insert or update or delete on public.service_recommendations for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_support_tickets on public.support_tickets;
create trigger trg_audit_support_tickets after insert or update or delete on public.support_tickets for each row execute function public.write_audit_log();
drop trigger if exists trg_audit_vehicle_documents on public.vehicle_documents;
create trigger trg_audit_vehicle_documents after insert or update or delete on public.vehicle_documents for each row execute function public.write_audit_log();

alter table public.service_jobs enable row level security;
alter table public.service_recommendations enable row level security;
alter table public.support_tickets enable row level security;
alter table public.vehicle_documents enable row level security;
alter table public.vehicle_timeline_events enable row level security;
alter table public.audit_log enable row level security;

create policy service_jobs_select on public.service_jobs for select using (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);
create policy service_jobs_insert on public.service_jobs for insert with check (public.same_workshop(workshop_account_id));
create policy service_jobs_update on public.service_jobs for update using (public.same_workshop(workshop_account_id));

create policy service_recommendations_select on public.service_recommendations for select using (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);
create policy service_recommendations_insert on public.service_recommendations for insert with check (public.same_workshop(workshop_account_id));
create policy service_recommendations_update_workshop on public.service_recommendations for update using (public.same_workshop(workshop_account_id));
create policy service_recommendations_update_customer on public.service_recommendations for update using (public.get_my_customer_account_id() = customer_account_id)
with check (public.get_my_customer_account_id() = customer_account_id);

create policy support_tickets_select on public.support_tickets for select using (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);
create policy support_tickets_insert on public.support_tickets for insert with check (public.get_my_customer_account_id() = customer_account_id or public.same_workshop(workshop_account_id));
create policy support_tickets_update on public.support_tickets for update using (public.same_workshop(workshop_account_id));

create policy vehicle_documents_select on public.vehicle_documents for select using (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);
create policy vehicle_documents_insert on public.vehicle_documents for insert with check (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);

create policy vehicle_timeline_events_select on public.vehicle_timeline_events for select using (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);
create policy vehicle_timeline_events_insert on public.vehicle_timeline_events for insert with check (
  public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id
);

create policy audit_log_select on public.audit_log for select using (public.same_workshop(workshop_account_id) or public.get_my_customer_account_id() = customer_account_id);

insert into storage.buckets (id, name, public) values ('vehicle-files', 'vehicle-files', false) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('vehicle-images', 'vehicle-images', false) on conflict (id) do nothing;

create policy "vehicle files customer read"
on storage.objects for select to authenticated using (
  bucket_id in ('vehicle-files','vehicle-images')
  and split_part(name,'/',2)::uuid = public.get_my_workshop_account_id()
  and split_part(name,'/',4)::uuid = public.get_my_customer_account_id()
);

create policy "vehicle files customer upload"
on storage.objects for insert to authenticated with check (
  bucket_id in ('vehicle-files','vehicle-images')
  and split_part(name,'/',1) = 'workshop'
  and split_part(name,'/',2)::uuid = public.get_my_workshop_account_id()
  and split_part(name,'/',3) = 'customer'
  and split_part(name,'/',4)::uuid = public.get_my_customer_account_id()
);

create policy "vehicle files workshop read"
on storage.objects for select to authenticated using (
  bucket_id in ('vehicle-files','vehicle-images')
  and split_part(name,'/',1) = 'workshop'
  and split_part(name,'/',2)::uuid = public.get_my_workshop_account_id()
);

revoke all on function public.create_vehicle_with_ownership_and_timeline(text,text,text,int,text,int,text) from public;
grant execute on function public.create_vehicle_with_ownership_and_timeline(text,text,text,int,text,int,text) to authenticated;
revoke all on function public.add_vehicle_timeline_event(uuid,uuid,uuid,text,text,text,jsonb) from public;
grant execute on function public.add_vehicle_timeline_event(uuid,uuid,uuid,text,text,text,jsonb) to authenticated;
