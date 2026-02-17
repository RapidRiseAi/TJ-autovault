-- Ensure RLS remains enabled for vehicles.
alter table if exists public.vehicles enable row level security;

-- Allow workshop admins to read vehicles for their workshop account.
drop policy if exists vehicles_select_workshop_admin on public.vehicles;
create policy vehicles_select_workshop_admin
on public.vehicles
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = vehicles.workshop_account_id
  )
);
