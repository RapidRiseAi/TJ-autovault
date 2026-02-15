insert into storage.buckets (id, name, public)
values ('private-images', 'private-images', false)
on conflict (id) do nothing;

create policy "private images upload own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'private-images'
  and split_part(name, '/', 2) = auth.uid()::text
);

create policy "private images read own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'private-images'
  and split_part(name, '/', 2) = auth.uid()::text
);

drop policy if exists attachments_select on public.attachments;
drop policy if exists attachments_insert on public.attachments;
drop policy if exists timeline_insert on public.timeline_events;

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
);

create policy timeline_insert on public.timeline_events
for insert
with check (
  public.same_workshop(workshop_account_id)
  or (
    exists (
      select 1
      from public.vehicles v
      where v.id = timeline_events.vehicle_id
        and v.workshop_account_id = timeline_events.workshop_account_id
        and public.is_customer_of_account(v.current_customer_account_id)
    )
  )
);
