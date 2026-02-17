-- Workshop workflows and approvals.

alter table if exists public.vehicle_timeline_events
  add column if not exists importance text not null default 'info';
alter table if exists public.vehicle_timeline_events
  drop constraint if exists vehicle_timeline_events_importance_check;
alter table if exists public.vehicle_timeline_events
  add constraint vehicle_timeline_events_importance_check check (importance in ('info','warning','urgent'));

create or replace function public.push_notification_to_workshop(
  p_workshop_account_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text
) returns void language plpgsql security definer set search_path=public as $$
declare v_profile_id uuid;
begin
  select p.id into v_profile_id
  from public.profiles p
  where p.role='admin' and p.workshop_account_id=p_workshop_account_id
  order by p.created_at asc limit 1;

  insert into public.notifications (workshop_account_id,to_profile_id,to_customer_account_id,kind,title,body,href)
  values (p_workshop_account_id,v_profile_id,null,p_kind,p_title,p_body,p_href);
end; $$;

create or replace function public.notify_workshop_on_customer_actions()
returns trigger language plpgsql security definer set search_path=public as $$
declare v_status text; v_title text; v_body text; v_kind text; v_href text;
begin
  v_status := coalesce(new.status::text,'');
  if tg_op <> 'UPDATE' or coalesce(old.status::text,'') = v_status or v_status not in ('approved','declined') then
    return new;
  end if;

  if tg_table_name='quotes' then
    v_kind := 'quote';
    v_title := 'Quote ' || v_status;
    v_body := 'Customer ' || v_status || ' quote #' || coalesce(new.quote_number, new.id::text);
    v_href := '/workshop/vehicles/' || new.vehicle_id::text;
  elsif tg_table_name='recommendations' then
    v_kind := 'system';
    v_title := 'Recommendation ' || v_status;
    v_body := 'Customer ' || v_status || ' recommendation: ' || coalesce(new.title, new.id::text);
    v_href := '/workshop/customers/' || new.customer_account_id::text;
  else
    return new;
  end if;

  perform public.push_notification_to_workshop(new.workshop_account_id, v_kind, v_title, v_body, v_href);
  return new;
end; $$;

drop trigger if exists trg_notify_workshop_on_quote_status on public.quotes;
create trigger trg_notify_workshop_on_quote_status after update on public.quotes for each row execute function public.notify_workshop_on_customer_actions();
drop trigger if exists trg_notify_workshop_on_recommendation_status on public.recommendations;
create trigger trg_notify_workshop_on_recommendation_status after update on public.recommendations for each row execute function public.notify_workshop_on_customer_actions();

-- workshop-admin + customer approval policies
create or replace function public.is_workshop_admin_for(p_workshop_account_id uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select exists (select 1 from public.profiles p where p.id=auth.uid() and p.role='admin' and p.workshop_account_id=p_workshop_account_id);
$$;

drop policy if exists quotes_select_workshop_admin on public.quotes;
create policy quotes_select_workshop_admin on public.quotes for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists quotes_insert_workshop_admin on public.quotes;
create policy quotes_insert_workshop_admin on public.quotes for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists quotes_update_workshop_admin on public.quotes;
create policy quotes_update_workshop_admin on public.quotes for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists quotes_customer_select_self on public.quotes;
create policy quotes_customer_select_self on public.quotes for select to authenticated using (exists (select 1 from public.customer_users cu where cu.profile_id=auth.uid() and cu.customer_account_id=quotes.customer_account_id));
drop policy if exists quotes_customer_approve_self on public.quotes;
create policy quotes_customer_approve_self on public.quotes for update to authenticated using (exists (select 1 from public.customer_users cu where cu.profile_id=auth.uid() and cu.customer_account_id=quotes.customer_account_id)) with check (exists (select 1 from public.customer_users cu where cu.profile_id=auth.uid() and cu.customer_account_id=quotes.customer_account_id) and status in ('approved','declined'));

drop policy if exists invoices_select_workshop_admin on public.invoices;
create policy invoices_select_workshop_admin on public.invoices for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists invoices_insert_workshop_admin on public.invoices;
create policy invoices_insert_workshop_admin on public.invoices for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists invoices_update_workshop_admin on public.invoices;
create policy invoices_update_workshop_admin on public.invoices for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists recommendations_select_workshop_admin on public.recommendations;
create policy recommendations_select_workshop_admin on public.recommendations for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists recommendations_insert_workshop_admin on public.recommendations;
create policy recommendations_insert_workshop_admin on public.recommendations for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists recommendations_update_workshop_admin on public.recommendations;
create policy recommendations_update_workshop_admin on public.recommendations for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists recommendations_customer_select_self on public.recommendations;
create policy recommendations_customer_select_self on public.recommendations for select to authenticated using (exists (select 1 from public.customer_users cu where cu.profile_id=auth.uid() and cu.customer_account_id=recommendations.customer_account_id));
drop policy if exists recommendations_customer_approve_self on public.recommendations;
create policy recommendations_customer_approve_self on public.recommendations for update to authenticated using (exists (select 1 from public.customer_users cu where cu.profile_id=auth.uid() and cu.customer_account_id=recommendations.customer_account_id)) with check (exists (select 1 from public.customer_users cu where cu.profile_id=auth.uid() and cu.customer_account_id=recommendations.customer_account_id) and status in ('approved','declined'));

drop policy if exists vehicle_documents_select_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_select_workshop_admin on public.vehicle_documents for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists vehicle_documents_insert_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_insert_workshop_admin on public.vehicle_documents for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists vehicle_documents_update_workshop_admin on public.vehicle_documents;
create policy vehicle_documents_update_workshop_admin on public.vehicle_documents for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists vehicle_media_select_workshop_admin on public.vehicle_media;
create policy vehicle_media_select_workshop_admin on public.vehicle_media for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists vehicle_media_insert_workshop_admin on public.vehicle_media;
create policy vehicle_media_insert_workshop_admin on public.vehicle_media for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists vehicle_media_update_workshop_admin on public.vehicle_media;
create policy vehicle_media_update_workshop_admin on public.vehicle_media for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists vehicle_timeline_events_select_workshop_admin on public.vehicle_timeline_events;
create policy vehicle_timeline_events_select_workshop_admin on public.vehicle_timeline_events for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists vehicle_timeline_events_insert_workshop_admin on public.vehicle_timeline_events;
create policy vehicle_timeline_events_insert_workshop_admin on public.vehicle_timeline_events for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
drop policy if exists vehicle_timeline_events_update_workshop_admin on public.vehicle_timeline_events;
create policy vehicle_timeline_events_update_workshop_admin on public.vehicle_timeline_events for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));

do $$ begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='service_jobs') then
    alter table public.service_jobs add column if not exists status text;
    alter table public.service_jobs add column if not exists updated_at timestamptz not null default now();
    drop policy if exists service_jobs_select_workshop_admin on public.service_jobs;
    create policy service_jobs_select_workshop_admin on public.service_jobs for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
    drop policy if exists service_jobs_insert_workshop_admin on public.service_jobs;
    create policy service_jobs_insert_workshop_admin on public.service_jobs for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
    drop policy if exists service_jobs_update_workshop_admin on public.service_jobs;
    create policy service_jobs_update_workshop_admin on public.service_jobs for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));
  elsif exists (select 1 from information_schema.tables where table_schema='public' and table_name='work_orders') then
    alter table public.work_orders add column if not exists status text;
    alter table public.work_orders add column if not exists updated_at timestamptz not null default now();
    drop policy if exists work_orders_select_workshop_admin on public.work_orders;
    create policy work_orders_select_workshop_admin on public.work_orders for select to authenticated using (public.is_workshop_admin_for(workshop_account_id));
    drop policy if exists work_orders_insert_workshop_admin on public.work_orders;
    create policy work_orders_insert_workshop_admin on public.work_orders for insert to authenticated with check (public.is_workshop_admin_for(workshop_account_id));
    drop policy if exists work_orders_update_workshop_admin on public.work_orders;
    create policy work_orders_update_workshop_admin on public.work_orders for update to authenticated using (public.is_workshop_admin_for(workshop_account_id)) with check (public.is_workshop_admin_for(workshop_account_id));
  end if;
end $$;

alter table if exists public.vehicles
  add column if not exists odometer_km int,
  add column if not exists next_service_km int,
  add column if not exists next_service_date date;
