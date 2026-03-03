drop policy if exists customer_accounts_insert_workshop_staff on public.customer_accounts;

create policy customer_accounts_insert_workshop_staff
on public.customer_accounts
for insert
with check (
  public.is_workshop_staff_for(workshop_account_id)
);
