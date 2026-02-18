-- Ensure timeline vehicle deletes can cascade cleanly.
alter table if exists public.timeline_events
  drop constraint if exists timeline_events_vehicle_id_fkey;

alter table if exists public.timeline_events
  add constraint timeline_events_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

-- Keep timeline rows immutable for updates, but allow deletes during cascades.
drop trigger if exists immutable_timeline_update on public.timeline_events;

create trigger immutable_timeline_update
before update on public.timeline_events
for each row
execute function public.prevent_mutation();

-- Align high-volume vehicle-linked tables to cascade with parent vehicle deletes.
alter table if exists public.service_jobs
  drop constraint if exists service_jobs_vehicle_id_fkey;

alter table if exists public.service_jobs
  add constraint service_jobs_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.service_recommendations
  drop constraint if exists service_recommendations_vehicle_id_fkey;

alter table if exists public.service_recommendations
  add constraint service_recommendations_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.support_tickets
  drop constraint if exists support_tickets_vehicle_id_fkey;

alter table if exists public.support_tickets
  add constraint support_tickets_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.vehicle_documents
  drop constraint if exists vehicle_documents_vehicle_id_fkey;

alter table if exists public.vehicle_documents
  add constraint vehicle_documents_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.vehicle_timeline_events
  drop constraint if exists vehicle_timeline_events_vehicle_id_fkey;

alter table if exists public.vehicle_timeline_events
  add constraint vehicle_timeline_events_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.customer_reports
  drop constraint if exists customer_reports_vehicle_id_fkey;

alter table if exists public.customer_reports
  add constraint customer_reports_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.vehicle_ownership_history
  drop constraint if exists vehicle_ownership_history_vehicle_id_fkey;

alter table if exists public.vehicle_ownership_history
  add constraint vehicle_ownership_history_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

alter table if exists public.consent_records
  drop constraint if exists consent_records_vehicle_id_fkey;

alter table if exists public.consent_records
  add constraint consent_records_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;
