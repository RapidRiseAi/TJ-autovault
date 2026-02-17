-- Ensure workshop admin users can upload files and manage quotes/invoices in their own workshop account.

alter table if exists storage.objects enable row level security;
alter table if exists public.invoices enable row level security;
alter table if exists public.quotes enable row level security;

drop policy if exists workshop_admin_storage_objects_all on storage.objects;
create policy workshop_admin_storage_objects_all
on storage.objects
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
  )
);

drop policy if exists workshop_admin_invoices_all on public.invoices;
create policy workshop_admin_invoices_all
on public.invoices
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = invoices.workshop_account_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = invoices.workshop_account_id
  )
);

drop policy if exists workshop_admin_quotes_all on public.quotes;
create policy workshop_admin_quotes_all
on public.quotes
for all
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = quotes.workshop_account_id
  )
)
with check (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id = quotes.workshop_account_id
  )
);
