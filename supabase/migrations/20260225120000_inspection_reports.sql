create table if not exists public.inspection_templates (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  name text not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_template_fields (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_templates(id) on delete cascade,
  sort_order int not null,
  field_type text not null check (field_type in ('checkbox','number','text','dropdown')),
  label text not null,
  required boolean not null default false,
  options jsonb null,
  created_at timestamptz not null default now()
);

create table if not exists public.inspection_reports (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  template_id uuid null references public.inspection_templates(id) on delete set null,
  mode text not null check (mode in ('digital','upload')),
  technician_profile_id uuid not null references public.profiles(id) on delete restrict,
  notes text null,
  answers jsonb null,
  pdf_storage_path text null,
  uploaded_storage_path text null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists inspection_templates_workshop_account_id_idx
  on public.inspection_templates(workshop_account_id);
create index if not exists inspection_reports_vehicle_id_idx
  on public.inspection_reports(vehicle_id);
create index if not exists inspection_reports_workshop_account_id_idx
  on public.inspection_reports(workshop_account_id);

alter table if exists public.inspection_templates enable row level security;
alter table if exists public.inspection_template_fields enable row level security;
alter table if exists public.inspection_reports enable row level security;

drop policy if exists inspection_templates_workshop_staff_select on public.inspection_templates;
create policy inspection_templates_workshop_staff_select
on public.inspection_templates for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists inspection_templates_workshop_staff_insert on public.inspection_templates;
create policy inspection_templates_workshop_staff_insert
on public.inspection_templates for insert to authenticated
with check (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists inspection_templates_workshop_staff_update on public.inspection_templates;
create policy inspection_templates_workshop_staff_update
on public.inspection_templates for update to authenticated
using (public.is_workshop_staff_for(workshop_account_id))
with check (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists inspection_templates_workshop_staff_delete on public.inspection_templates;
create policy inspection_templates_workshop_staff_delete
on public.inspection_templates for delete to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists inspection_template_fields_workshop_staff_all on public.inspection_template_fields;
create policy inspection_template_fields_workshop_staff_all
on public.inspection_template_fields for all to authenticated
using (
  exists (
    select 1
    from public.inspection_templates it
    where it.id = inspection_template_fields.template_id
      and public.is_workshop_staff_for(it.workshop_account_id)
  )
)
with check (
  exists (
    select 1
    from public.inspection_templates it
    where it.id = inspection_template_fields.template_id
      and public.is_workshop_staff_for(it.workshop_account_id)
  )
);

drop policy if exists inspection_reports_workshop_staff_select on public.inspection_reports;
create policy inspection_reports_workshop_staff_select
on public.inspection_reports for select to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists inspection_reports_workshop_staff_insert on public.inspection_reports;
create policy inspection_reports_workshop_staff_insert
on public.inspection_reports for insert to authenticated
with check (
  public.is_workshop_staff_for(workshop_account_id)
  and exists (
    select 1 from public.vehicles v
    where v.id = inspection_reports.vehicle_id
      and v.workshop_account_id = inspection_reports.workshop_account_id
  )
);

drop policy if exists inspection_reports_workshop_staff_update on public.inspection_reports;
create policy inspection_reports_workshop_staff_update
on public.inspection_reports for update to authenticated
using (public.is_workshop_staff_for(workshop_account_id))
with check (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists inspection_reports_customer_select_own_vehicle on public.inspection_reports;
create policy inspection_reports_customer_select_own_vehicle
on public.inspection_reports for select to authenticated
using (
  exists (
    select 1
    from public.vehicles v
    join public.customer_users cu
      on cu.customer_account_id = v.current_customer_account_id
    where v.id = inspection_reports.vehicle_id
      and cu.profile_id = auth.uid()
      and v.current_customer_account_id is not null
  )
);

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
    'deletion_completed',
    'inspection_report_added'
  ));

create or replace function public.log_vehicle_document_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_label text;
  v_title text;
  v_description text;
  v_importance text;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  if new.document_type in ('quote', 'invoice', 'inspection') then
    return new;
  end if;

  if exists (
    select 1
    from public.vehicle_timeline_events event
    where event.vehicle_id = new.vehicle_id
      and event.event_type = 'doc_uploaded'
      and event.metadata ->> 'doc_id' = new.id::text
  ) then
    return new;
  end if;

  v_doc_label := replace(coalesce(new.document_type, 'other'), '_', ' ');
  v_title := coalesce(new.subject, new.original_name, 'Document uploaded');
  v_description := 'Uploaded ' || v_doc_label;

  if new.document_type = 'vehicle_photo' then
    v_title := 'Vehicle photo updated';
    v_description := coalesce(new.subject, new.original_name, 'Vehicle photo updated');
  end if;

  v_importance := case
    when new.importance in ('info', 'warning', 'urgent') then new.importance
    else 'info'
  end;

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
  ) values (
    new.workshop_account_id,
    new.customer_account_id,
    new.vehicle_id,
    auth.uid(),
    coalesce(public.current_role(), 'system'),
    'doc_uploaded',
    v_title,
    v_description,
    v_importance,
    jsonb_build_object('table', 'vehicle_documents', 'op', 'INSERT', 'doc_id', new.id, 'type', new.document_type)
  );

  return new;
end;
$$;
