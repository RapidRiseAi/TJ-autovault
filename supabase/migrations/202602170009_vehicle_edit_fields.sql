-- Backfill/edit-safety migration for vehicle edit fields used by app payloads.
alter table if exists public.vehicles
  add column if not exists notes text,
  add column if not exists vin text,
  add column if not exists odometer_km integer,
  add column if not exists primary_image_path text,
  add column if not exists vehicle_image_doc_id uuid;

-- Allow workshop admins to update vehicles in their own workshop account.
drop policy if exists vehicles_update_workshop_admin on public.vehicles;
create policy vehicles_update_workshop_admin
on public.vehicles
for update
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = vehicles.workshop_account_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = vehicles.workshop_account_id
  )
);

-- Force PostgREST to refresh schema cache after column updates.
select pg_notify('pgrst', 'reload schema');
