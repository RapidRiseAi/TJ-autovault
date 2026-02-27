do $$
declare
  v_allowed_event_types text[];
  v_constraint_sql text;
begin
  if to_regclass('public.vehicle_timeline_events') is null then
    return;
  end if;

  select array_agg(distinct source.event_type order by source.event_type)
    into v_allowed_event_types
  from (
    select unnest(array[
      'vehicle_created',
      'status_changed',
      'doc_uploaded',
      'job_created',
      'job_status_changed',
      'recommendation_added',
      'recommendation_status_changed',
      'ticket_created',
      'message',
      'note',
      'inspection_requested',
      'service_requested',
      'quote_created',
      'quote_status_changed',
      'invoice_created',
      'payment_status_changed',
      'problem_reported',
      'mileage_updated',
      'deletion_requested',
      'deletion_exported',
      'deletion_completed',
      'inspection_report_added',
      'job_started',
      'job_progress_updated',
      'job_approval_requested',
      'job_completed',
      'job_closed',
      'job_archive_ready'
    ]) as event_type
    union
    select event.event_type
    from public.vehicle_timeline_events event
  ) source
  where source.event_type is not null
    and btrim(source.event_type) <> '';

  execute 'alter table public.vehicle_timeline_events drop constraint if exists vehicle_timeline_events_event_type_check';

  select format(
    'alter table public.vehicle_timeline_events add constraint vehicle_timeline_events_event_type_check check (event_type in (%s))',
    string_agg(format('%L', event_type), ', ')
  )
  into v_constraint_sql
  from unnest(v_allowed_event_types) as event_type;

  execute v_constraint_sql;
end;
$$;
