-- Ensure every vehicle document upload is represented in vehicle_timeline_events
-- without relying on application-side writes.

create or replace function public.log_vehicle_document_timeline_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc_label text;
  v_title text;
  v_description text;
  v_importance text;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  if new.document_type in ('quote', 'invoice') then
    return new;
  end if;

  if exists (
    select 1
    from public.vehicle_timeline_events event
    where event.vehicle_id = new.vehicle_id
      and event.event_type = 'doc_uploaded'
      and event.metadata ->> 'doc_id' = new.id::text
  ) then
    return new;
  end if;

  v_doc_label := replace(coalesce(new.document_type, 'other'), '_', ' ');
  v_title := coalesce(new.subject, new.original_name, 'Document uploaded');
  v_description := 'Uploaded ' || v_doc_label;

  if new.document_type = 'vehicle_photo' then
    v_title := 'Vehicle photo updated';
    v_description := coalesce(new.subject, new.original_name, 'Vehicle photo updated');
  end if;

  v_importance := case
    when new.importance in ('info', 'warning', 'urgent') then new.importance
    else 'info'
  end;

  insert into public.vehicle_timeline_events (
    workshop_account_id,
    customer_account_id,
    vehicle_id,
    actor_profile_id,
    actor_role,
    event_type,
    title,
    description,
    importance,
    metadata
  ) values (
    new.workshop_account_id,
    new.customer_account_id,
    new.vehicle_id,
    auth.uid(),
    coalesce(public.current_role(), 'system'),
    'doc_uploaded',
    v_title,
    v_description,
    v_importance,
    jsonb_build_object('table', 'vehicle_documents', 'op', 'INSERT', 'doc_id', new.id, 'type', new.document_type)
  );

  return new;
end;
$$;

drop trigger if exists trg_vehicle_documents_log_timeline on public.vehicle_documents;
create trigger trg_vehicle_documents_log_timeline
after insert on public.vehicle_documents
for each row
execute function public.log_vehicle_document_timeline_event();
