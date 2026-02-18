alter table if exists public.timeline_events
  drop constraint if exists timeline_events_vehicle_id_fkey;

alter table if exists public.timeline_events
  add constraint timeline_events_vehicle_id_fkey
  foreign key (vehicle_id)
  references public.vehicles(id)
  on delete cascade;

drop trigger if exists immutable_timeline_update on public.timeline_events;
create trigger immutable_timeline_update
before update on public.timeline_events
for each row
execute function public.prevent_mutation();
