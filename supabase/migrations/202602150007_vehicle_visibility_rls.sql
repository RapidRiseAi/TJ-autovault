-- Ensure RLS is enabled for vehicle visibility tables.
alter table if exists public.vehicles enable row level security;
alter table if exists public.vehicle_ownership_history enable row level security;

-- Replace vehicle SELECT policy so customers can read currently-owned or historically-owned vehicles.
drop policy if exists vehicles_select on public.vehicles;
create policy vehicles_select
on public.vehicles
for select
using (
  public.same_workshop(workshop_account_id)
  or public.is_customer_of_account(current_customer_account_id)
  or exists (
    select 1
    from public.vehicle_ownership_history voh
    where voh.vehicle_id = vehicles.id
      and public.is_customer_of_account(voh.to_customer_account_id)
  )
  or public.is_admin()
);

-- Replace ownership history SELECT policy so customers can view their related transfers.
drop policy if exists vehicle_ownership_history_select on public.vehicle_ownership_history;
create policy vehicle_ownership_history_select
on public.vehicle_ownership_history
for select
using (
  public.is_customer_of_account(to_customer_account_id)
  or public.is_customer_of_account(from_customer_account_id)
  or public.is_admin()
);
