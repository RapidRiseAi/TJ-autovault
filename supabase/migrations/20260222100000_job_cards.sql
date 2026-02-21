create table if not exists public.job_cards (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  workshop_id uuid not null references public.workshop_accounts(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'not_started' check (status in ('not_started','in_progress','waiting_parts','waiting_approval','quality_check','ready','completed','closed')),
  title text not null,
  started_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  last_updated_at timestamptz not null default now(),
  customer_summary text,
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.job_card_assignments (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  technician_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(job_card_id, technician_user_id)
);

create table if not exists public.job_card_events (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.job_card_updates (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  message text not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  auto_generated boolean not null default false
);

create table if not exists public.job_card_photos (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  kind text not null check (kind in ('before','after','other')),
  storage_path text not null,
  uploaded_at timestamptz not null default now(),
  uploaded_by uuid references public.profiles(id) on delete set null
);

create table if not exists public.job_card_parts (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  name text not null,
  qty numeric(10,2) not null default 1,
  status text not null default 'needed' check (status in ('used','needed')),
  eta timestamptz,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.job_card_blockers (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  type text not null check (type in ('parts','approval','other')),
  message text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.job_card_approvals (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  title text not null,
  description text,
  estimate_amount integer,
  status text not null default 'pending' check (status in ('pending','approved','declined')),
  requested_by uuid references public.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz
);

create table if not exists public.job_card_checklist_items (
  id uuid primary key default gen_random_uuid(),
  job_card_id uuid not null references public.job_cards(id) on delete cascade,
  label text not null,
  is_required boolean not null default false,
  is_done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles(id) on delete set null
);

create index if not exists job_cards_vehicle_idx on public.job_cards(vehicle_id, created_at desc);
create index if not exists job_cards_workshop_idx on public.job_cards(workshop_id, status, last_updated_at desc);

alter table public.job_cards enable row level security;
alter table public.job_card_assignments enable row level security;
alter table public.job_card_events enable row level security;
alter table public.job_card_updates enable row level security;
alter table public.job_card_photos enable row level security;
alter table public.job_card_parts enable row level security;
alter table public.job_card_blockers enable row level security;
alter table public.job_card_approvals enable row level security;
alter table public.job_card_checklist_items enable row level security;

create or replace function public.can_view_job_card(p_job_card_id uuid)
returns boolean language sql stable as $$
  select exists (
    select 1
    from public.job_cards jc
    join public.vehicles v on v.id = jc.vehicle_id
    where jc.id = p_job_card_id
      and (
        public.is_workshop_staff_for(jc.workshop_id)
        or exists (
          select 1 from public.customer_users cu
          where cu.profile_id = auth.uid()
            and cu.customer_account_id = v.current_customer_account_id
        )
      )
  );
$$;

create policy job_cards_select on public.job_cards for select to authenticated
using (
  public.is_workshop_staff_for(workshop_id)
  or exists (
    select 1 from public.vehicles v
    join public.customer_users cu on cu.customer_account_id = v.current_customer_account_id
    where v.id = job_cards.vehicle_id and cu.profile_id = auth.uid()
  )
);

create policy job_cards_insert on public.job_cards for insert to authenticated
with check (public.is_workshop_staff_for(workshop_id));

create policy job_cards_update on public.job_cards for update to authenticated
using (public.is_workshop_staff_for(workshop_id))
with check (public.is_workshop_staff_for(workshop_id));

create policy job_cards_delete on public.job_cards for delete to authenticated
using (public.is_workshop_admin_for(workshop_id));

create policy job_card_assignments_all on public.job_card_assignments for all to authenticated
using (public.can_view_job_card(job_card_id))
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_assignments.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_events_all on public.job_card_events for all to authenticated
using (public.can_view_job_card(job_card_id))
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_events.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_updates_select on public.job_card_updates for select to authenticated
using (public.can_view_job_card(job_card_id));
create policy job_card_updates_mutate on public.job_card_updates for all to authenticated
using (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_updates.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
)
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_updates.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_photos_select on public.job_card_photos for select to authenticated
using (public.can_view_job_card(job_card_id));
create policy job_card_photos_mutate on public.job_card_photos for all to authenticated
using (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_photos.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
)
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_photos.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_parts_all on public.job_card_parts for all to authenticated
using (public.can_view_job_card(job_card_id))
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_parts.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_blockers_all on public.job_card_blockers for all to authenticated
using (public.can_view_job_card(job_card_id))
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_blockers.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_checklist_all on public.job_card_checklist_items for all to authenticated
using (public.can_view_job_card(job_card_id))
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_checklist_items.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);

create policy job_card_approvals_select on public.job_card_approvals for select to authenticated
using (public.can_view_job_card(job_card_id));
create policy job_card_approvals_insert on public.job_card_approvals for insert to authenticated
with check (
  exists (
    select 1 from public.job_cards jc where jc.id = job_card_approvals.job_card_id and public.is_workshop_staff_for(jc.workshop_id)
  )
);
create policy job_card_approvals_update on public.job_card_approvals for update to authenticated
using (
  public.can_view_job_card(job_card_id)
)
with check (
  public.can_view_job_card(job_card_id)
);
