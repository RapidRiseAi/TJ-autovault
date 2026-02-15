insert into storage.buckets (id, name, public)
values ('private-documents', 'private-documents', false)
on conflict (id) do nothing;

alter table public.attachments add column if not exists bucket text;
alter table public.attachments add column if not exists original_name text;
alter table public.attachments add column if not exists size_bytes bigint;

drop policy if exists "private images upload own" on storage.objects;
drop policy if exists "private images read own" on storage.objects;

create policy "private images upload by customer membership"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'private-images'
  and split_part(name, '/', 1) = 'customers'
  and split_part(name, '/', 2)::uuid in (
    select cu.customer_account_id from public.customer_users cu where cu.profile_id = auth.uid()
  )
);

create policy "private images read by customer membership"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'private-images'
  and split_part(name, '/', 1) = 'customers'
  and split_part(name, '/', 2)::uuid in (
    select cu.customer_account_id from public.customer_users cu where cu.profile_id = auth.uid()
  )
);

create policy "private documents upload by customer membership"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'private-documents'
  and split_part(name, '/', 1) = 'customers'
  and split_part(name, '/', 2)::uuid in (
    select cu.customer_account_id from public.customer_users cu where cu.profile_id = auth.uid()
  )
);

create policy "private documents read by customer membership"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'private-documents'
  and split_part(name, '/', 1) = 'customers'
  and split_part(name, '/', 2)::uuid in (
    select cu.customer_account_id from public.customer_users cu where cu.profile_id = auth.uid()
  )
);

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;

create policy attachments_select on public.attachments
for select
using (
  public.same_workshop(workshop_account_id)
  or (
    entity_type = 'customer_report'
    and exists (
      select 1
      from public.customer_reports cr
      where cr.id = attachments.entity_id
        and public.is_customer_of_account(cr.customer_account_id)
    )
  )
  or (
    entity_type = 'vehicle'
    and exists (
      select 1
      from public.vehicles v
      where v.id = attachments.entity_id
        and public.is_customer_of_account(v.current_customer_account_id)
    )
  )
);

create policy attachments_insert on public.attachments
for insert
with check (
  public.same_workshop(workshop_account_id)
  or (
    entity_type = 'customer_report'
    and exists (
      select 1
      from public.customer_reports cr
      where cr.id = attachments.entity_id
        and cr.workshop_account_id = attachments.workshop_account_id
        and public.is_customer_of_account(cr.customer_account_id)
    )
  )
  or (
    entity_type = 'vehicle'
    and exists (
      select 1
      from public.vehicles v
      where v.id = attachments.entity_id
        and v.workshop_account_id = attachments.workshop_account_id
        and public.is_customer_of_account(v.current_customer_account_id)
    )
  )
);
