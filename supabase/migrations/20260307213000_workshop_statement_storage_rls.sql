-- Allow workshop statement PDF writes under:
--   vehicle-files/workshop/{workshop_account_id}/statements/{file}
-- for workshop staff (admin/technician) of that workshop.

drop policy if exists "vehicle files workshop statements upload" on storage.objects;
create policy "vehicle files workshop statements upload"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'vehicle-files'
  and split_part(name, '/', 1) = 'workshop'
  and split_part(name, '/', 3) = 'statements'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'technician')
      and p.workshop_account_id::text = split_part(storage.objects.name, '/', 2)
  )
);

drop policy if exists "vehicle files workshop statements update" on storage.objects;
create policy "vehicle files workshop statements update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'vehicle-files'
  and split_part(name, '/', 1) = 'workshop'
  and split_part(name, '/', 3) = 'statements'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'technician')
      and p.workshop_account_id::text = split_part(storage.objects.name, '/', 2)
  )
)
with check (
  bucket_id = 'vehicle-files'
  and split_part(name, '/', 1) = 'workshop'
  and split_part(name, '/', 3) = 'statements'
  and exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.role in ('admin', 'technician')
      and p.workshop_account_id::text = split_part(storage.objects.name, '/', 2)
  )
);
