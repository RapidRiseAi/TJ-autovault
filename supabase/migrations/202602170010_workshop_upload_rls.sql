-- NOTE: Version bumped to 202602170010 due to schema_migrations version collision in CI.
-- Fix workshop/admin upload RLS for workshop vehicle document uploads.
-- Upload path from app/api/uploads/sign: workshop/{workshop_account_id}/customer/{customer_account_id}/vehicle/{vehicle_id}/{document_type}/{file}

-- Workshop admins can upload workshop-scoped vehicle files.
drop policy if exists "vehicle files workshop admin upload" on storage.objects;
create policy "vehicle files workshop admin upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-files'
  and split_part(name, '/', 1) = 'workshop'
  and split_part(name, '/', 3) = 'customer'
  and split_part(name, '/', 5) = 'vehicle'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id::text = split_part(storage.objects.name, '/', 2)
  )
);

-- Workshop admins can list/read workshop-scoped vehicle files.
drop policy if exists "vehicle files workshop admin read" on storage.objects;
create policy "vehicle files workshop admin read"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'vehicle-files'
  and split_part(name, '/', 1) = 'workshop'
  and split_part(name, '/', 3) = 'customer'
  and split_part(name, '/', 5) = 'vehicle'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role = 'admin'
      and p.workshop_account_id::text = split_part(storage.objects.name, '/', 2)
  )
);
