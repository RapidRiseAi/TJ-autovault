-- Fix production workflow blockers for reminders/recommendations/uploads:
-- 1) recommendations still required legacy work_order_id while app writes vehicle-centric recommendations
-- 2) workshop technicians were allowed by app server actions but blocked by RLS on vehicles + vehicle_documents

-- 1) Recommendations compatibility with vehicle-centric writes.
alter table if exists public.recommendations
  alter column work_order_id drop not null;

-- 2) Workshop staff helper (admin + technician).
create or replace function public.is_workshop_staff_for(p_workshop_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'technician')
      and p.workshop_account_id = p_workshop_account_id
  );
$$;

-- Allow workshop staff to read/update workshop vehicles.
drop policy if exists vehicles_select_workshop_admin on public.vehicles;
create policy vehicles_select_workshop_staff
on public.vehicles
for select
to authenticated
using (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists vehicles_update_workshop_admin on public.vehicles;
create policy vehicles_update_workshop_staff
on public.vehicles
for update
to authenticated
using (public.is_workshop_staff_for(workshop_account_id))
with check (public.is_workshop_staff_for(workshop_account_id));

-- Allow workshop staff to write vehicle upload metadata.
drop policy if exists vehicle_documents_insert_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_insert_workshop_staff on public.vehicle_documents
for insert to authenticated
with check (public.is_workshop_staff_for(workshop_account_id));

-- Keep workshop update on vehicle documents aligned with staff permissions.
drop policy if exists vehicle_documents_update_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_update_workshop_staff on public.vehicle_documents
for update to authenticated
using (public.is_workshop_staff_for(workshop_account_id))
with check (public.is_workshop_staff_for(workshop_account_id));

-- Storage policy for workshop staff vehicle primary-image uploads/reads.
drop policy if exists "vehicle images workshop staff upload primary" on storage.objects;
create policy "vehicle images workshop staff upload primary"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = 'vehicles'
  and split_part(name, '/', 3) = 'primary'
  and exists (
    select 1
    from public.vehicles v
    where v.id::text = split_part(storage.objects.name, '/', 2)
      and public.is_workshop_staff_for(v.workshop_account_id)
  )
);

drop policy if exists "vehicle images workshop staff read primary" on storage.objects;
create policy "vehicle images workshop staff read primary"
on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = 'vehicles'
  and split_part(name, '/', 3) = 'primary'
  and exists (
    select 1
    from public.vehicles v
    where v.id::text = split_part(storage.objects.name, '/', 2)
      and public.is_workshop_staff_for(v.workshop_account_id)
  )
);

-- Force PostgREST to refresh schema cache for policy/function updates.
select pg_notify('pgrst', 'reload schema');
