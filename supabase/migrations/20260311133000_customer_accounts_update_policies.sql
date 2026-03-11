-- Fix workshop/customer billing updates blocked by RLS on customer_accounts.

drop policy if exists customer_accounts_update_workshop_staff on public.customer_accounts;
create policy customer_accounts_update_workshop_staff
on public.customer_accounts
for update
using (public.is_workshop_staff_for(workshop_account_id))
with check (public.is_workshop_staff_for(workshop_account_id));

drop policy if exists customer_accounts_update_self on public.customer_accounts;
create policy customer_accounts_update_self
on public.customer_accounts
for update
using (public.is_customer_of_account(id))
with check (public.is_customer_of_account(id));
