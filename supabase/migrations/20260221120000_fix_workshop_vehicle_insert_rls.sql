-- Allow workshop staff (admin + technician) to create vehicles for their workshop.
-- This unblocks workshop-side "Add vehicle for customer" flow while keeping customer self-insert policy intact.

drop policy if exists vehicles_insert_workshop_staff on public.vehicles;
create policy vehicles_insert_workshop_staff
on public.vehicles
for insert
to authenticated
with check (public.is_workshop_staff_for(workshop_account_id));

-- Ensure PostgREST reflects policy change quickly.
select pg_notify('pgrst', 'reload schema');
