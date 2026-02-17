-- Upload workflow cleanup: richer vehicle documents, quote/invoice linkage, and vehicle primary image support.

alter table if exists public.vehicle_documents
  add column if not exists document_type text not null default 'other',
  add column if not exists subject text,
  add column if not exists body text,
  add column if not exists importance text not null default 'info',
  add column if not exists quote_id uuid,
  add column if not exists invoice_id uuid;

-- Keep legacy doc_type and new document_type aligned.
update public.vehicle_documents
set document_type = case
  when coalesce(document_type, '') <> '' and document_type <> 'other' then document_type
  when doc_type in ('report_photo') then 'report'
  when doc_type in ('invoice') then 'invoice'
  when doc_type in ('vehicle_photo','license_disk') then 'other'
  else coalesce(doc_type, 'other')
end
where true;

alter table if exists public.vehicle_documents
  drop constraint if exists vehicle_documents_importance_check;
alter table if exists public.vehicle_documents
  add constraint vehicle_documents_importance_check check (importance in ('info','warning','urgent'));

alter table if exists public.vehicle_documents
  drop constraint if exists vehicle_documents_document_type_check;
alter table if exists public.vehicle_documents
  add constraint vehicle_documents_document_type_check check (document_type in ('before_images','after_images','inspection','quote','invoice','parts_list','warranty','report','other'));

alter table if exists public.vehicle_documents
  drop constraint if exists vehicle_documents_doc_type_check;
alter table if exists public.vehicle_documents
  add constraint vehicle_documents_doc_type_check check (doc_type in ('vehicle_photo','license_disk','invoice','report_photo','other','before_images','after_images','inspection','quote','parts_list','warranty','report'));

create index if not exists vehicle_documents_document_type_idx on public.vehicle_documents(document_type);
create index if not exists vehicle_documents_importance_idx on public.vehicle_documents(importance);

alter table if exists public.quotes
  add column if not exists document_id uuid references public.vehicle_documents(id) on delete set null;
alter table if exists public.invoices
  add column if not exists document_id uuid references public.vehicle_documents(id) on delete set null;

alter table if exists public.vehicle_documents
  add constraint vehicle_documents_quote_id_fkey foreign key (quote_id) references public.quotes(id) on delete set null;
alter table if exists public.vehicle_documents
  add constraint vehicle_documents_invoice_id_fkey foreign key (invoice_id) references public.invoices(id) on delete set null;

alter table if exists public.vehicles
  add column if not exists primary_image_path text;

-- Tighten customer insert access: customer-owned docs only, and no quote/invoice document types.
drop policy if exists vehicle_documents_insert on public.vehicle_documents;
drop policy if exists vehicle_documents_insert_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_insert_workshop_admin on public.vehicle_documents
for insert to authenticated
with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists vehicle_documents_insert_customer_reports on public.vehicle_documents;
create policy vehicle_documents_insert_customer_reports on public.vehicle_documents
for insert to authenticated
with check (
  public.get_my_customer_account_id() = customer_account_id
  and document_type not in ('quote', 'invoice')
);

-- Keep workshop/customer read and workshop update strict.
drop policy if exists vehicle_documents_select_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_select_workshop_admin on public.vehicle_documents
for select to authenticated
using (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists vehicle_documents_select_customer_self on public.vehicle_documents;
create policy vehicle_documents_select_customer_self on public.vehicle_documents
for select to authenticated
using (public.get_my_customer_account_id() = customer_account_id);

drop policy if exists vehicle_documents_update_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_update_workshop_admin on public.vehicle_documents
for update to authenticated
using (public.is_workshop_admin_for(workshop_account_id))
with check (public.is_workshop_admin_for(workshop_account_id));

-- Customer can update primary vehicle image for owned vehicles.
drop policy if exists vehicles_customer_update_primary_image_self on public.vehicles;
create policy vehicles_customer_update_primary_image_self on public.vehicles
for update to authenticated
using (public.get_my_customer_account_id() = current_customer_account_id)
with check (public.get_my_customer_account_id() = current_customer_account_id);

-- Allow vehicle primary image storage path format: vehicles/{vehicleId}/primary/{file}
drop policy if exists "vehicle images customer upload primary" on storage.objects;
create policy "vehicle images customer upload primary"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = 'vehicles'
  and exists (
    select 1 from public.vehicles v
    where v.id::text = split_part(name, '/', 2)
      and v.current_customer_account_id = public.get_my_customer_account_id()
  )
);

drop policy if exists "vehicle images customer read primary" on storage.objects;
create policy "vehicle images customer read primary"
on storage.objects for select to authenticated
using (
  bucket_id = 'vehicle-images'
  and split_part(name, '/', 1) = 'vehicles'
  and (
    exists (
      select 1 from public.vehicles v
      where v.id::text = split_part(name, '/', 2)
        and v.current_customer_account_id = public.get_my_customer_account_id()
    )
    or exists (
      select 1 from public.vehicles v
      where v.id::text = split_part(name, '/', 2)
        and public.is_workshop_admin_for(v.workshop_account_id)
    )
  )
);
