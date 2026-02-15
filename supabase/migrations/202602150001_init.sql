create extension if not exists pgcrypto;

create type public.user_role as enum ('admin', 'technician', 'customer');
create type public.customer_tier as enum ('free', 'standard', 'premium');
create type public.workshop_plan as enum ('free', 'growth', 'enterprise');
create type public.quote_decision as enum ('pending', 'approved', 'declined');
create type public.recommendation_status as enum ('open', 'quoted', 'approved', 'declined', 'completed');
create type public.inspection_item_status as enum ('ok', 'soon', 'urgent');

create table public.workshop_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  plan public.workshop_plan not null default 'free',
  created_at timestamptz not null default now()
);

create table public.workshop_branding_settings (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  logo_url text,
  primary_color text not null default '#cf2027',
  secondary_color text not null default '#111111',
  watermark_enabled boolean not null default true,
  watermark_text text not null default 'Powered by Rapid Rise AI',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id),
  workshop_account_id uuid references public.workshop_accounts(id),
  role public.user_role not null,
  display_name text,
  created_at timestamptz not null default now()
);

create table public.customer_accounts (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  name text not null,
  tier public.customer_tier not null default 'free',
  created_at timestamptz not null default now()
);

create table public.customer_users (
  id uuid primary key default gen_random_uuid(),
  customer_account_id uuid not null references public.customer_accounts(id),
  profile_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique(customer_account_id, profile_id)
);

create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  current_customer_account_id uuid references public.customer_accounts(id),
  registration_number text not null,
  make text,
  model text,
  year int,
  vin text,
  odometer_km int,
  created_at timestamptz not null default now()
);

create table public.vehicle_ownership_history (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  from_customer_account_id uuid references public.customer_accounts(id),
  to_customer_account_id uuid references public.customer_accounts(id),
  transferred_at timestamptz not null default now(),
  transferred_by uuid references public.profiles(id)
);

create table public.consent_records (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  from_customer_account_id uuid not null references public.customer_accounts(id),
  to_customer_account_id uuid not null references public.customer_accounts(id),
  history_share_approved boolean not null,
  notes text,
  approved_at timestamptz,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.work_orders (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  vehicle_id uuid not null references public.vehicles(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  status text not null,
  odometer_in_km int,
  odometer_out_km int,
  internal_notes text,
  customer_notes text,
  checked_in_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.inspections (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  work_order_id uuid not null references public.work_orders(id),
  structured_json jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id),
  section_name text not null,
  item_label text not null,
  status public.inspection_item_status not null,
  notes text,
  created_at timestamptz not null default now()
);

create table public.recommendations (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  work_order_id uuid not null references public.work_orders(id),
  inspection_item_id uuid references public.inspection_items(id),
  status public.recommendation_status not null default 'open',
  created_at timestamptz not null default now()
);

create table public.quote_uploads (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  work_order_id uuid not null references public.work_orders(id),
  storage_path text not null,
  status public.quote_decision not null default 'pending',
  approved_at timestamptz,
  declined_at timestamptz,
  approved_by_profile_id uuid references public.profiles(id),
  correction_of_id uuid references public.quote_uploads(id),
  created_at timestamptz not null default now()
);

create table public.invoice_uploads (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  work_order_id uuid not null references public.work_orders(id),
  storage_path text not null,
  correction_of_id uuid references public.invoice_uploads(id),
  created_at timestamptz not null default now()
);

create table public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  invoice_upload_id uuid not null references public.invoice_uploads(id),
  storage_path text not null,
  uploaded_by_profile_id uuid references public.profiles(id),
  correction_of_id uuid references public.payment_proofs(id),
  created_at timestamptz not null default now()
);

create table public.customer_reports (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  customer_account_id uuid not null references public.customer_accounts(id),
  vehicle_id uuid references public.vehicles(id),
  category text not null,
  severity text not null,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.attachments (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  entity_type text not null,
  entity_id uuid not null,
  storage_path text not null,
  mime_type text not null,
  created_by uuid references public.profiles(id),
  correction_of_id uuid references public.attachments(id),
  created_at timestamptz not null default now()
);

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  vehicle_id uuid references public.vehicles(id),
  work_order_id uuid references public.work_orders(id),
  actor_profile_id uuid references public.profiles(id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  correction_of_id uuid references public.timeline_events(id),
  created_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id),
  actor_profile_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.current_profile() returns public.profiles language sql stable as $$
  select p.* from public.profiles p where p.id = auth.uid()
$$;

create or replace function public.is_admin() returns boolean language sql stable as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

create or replace function public.same_workshop(workshop_id uuid) returns boolean language sql stable as $$
  select exists(select 1 from public.profiles p where p.id = auth.uid() and p.workshop_account_id = workshop_id)
$$;

create or replace function public.is_customer_of_account(ca_id uuid) returns boolean language sql stable as $$
  select exists(
    select 1 from public.customer_users cu
    join public.profiles p on p.id = cu.profile_id
    where cu.customer_account_id = ca_id and p.id = auth.uid()
  )
$$;

create or replace function public.prevent_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'Immutable table: updates/deletes are not allowed';
end;
$$;

alter table public.workshop_accounts enable row level security;
alter table public.workshop_branding_settings enable row level security;
alter table public.profiles enable row level security;
alter table public.customer_accounts enable row level security;
alter table public.customer_users enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_ownership_history enable row level security;
alter table public.consent_records enable row level security;
alter table public.work_orders enable row level security;
alter table public.inspections enable row level security;
alter table public.inspection_items enable row level security;
alter table public.recommendations enable row level security;
alter table public.quote_uploads enable row level security;
alter table public.invoice_uploads enable row level security;
alter table public.payment_proofs enable row level security;
alter table public.customer_reports enable row level security;
alter table public.attachments enable row level security;
alter table public.timeline_events enable row level security;
alter table public.audit_logs enable row level security;

create policy workshop_read on public.workshop_accounts for select using (public.same_workshop(id));
create policy workshop_branding_rw on public.workshop_branding_settings for all using (public.same_workshop(workshop_account_id)) with check (public.same_workshop(workshop_account_id) and public.is_admin());
create policy profiles_self_or_admin on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy customer_accounts_select on public.customer_accounts for select using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(id));
create policy customer_users_select on public.customer_users for select using (profile_id = auth.uid() or public.is_admin());
create policy vehicles_select on public.vehicles for select using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(current_customer_account_id));
create policy vehicles_insert on public.vehicles for insert with check (public.same_workshop(workshop_account_id) or public.is_customer_of_account(current_customer_account_id));
create policy work_orders_select on public.work_orders for select using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(customer_account_id));
create policy work_orders_insert on public.work_orders for insert with check (public.same_workshop(workshop_account_id));
create policy inspections_insert on public.inspections for insert with check (public.same_workshop(workshop_account_id));
create policy inspections_select on public.inspections for select using (public.same_workshop(workshop_account_id));
create policy inspection_items_select on public.inspection_items for select using (exists (select 1 from public.inspections i where i.id = inspection_id and public.same_workshop(i.workshop_account_id)));
create policy inspection_items_insert on public.inspection_items for insert with check (exists (select 1 from public.inspections i where i.id = inspection_id and public.same_workshop(i.workshop_account_id)));
create policy recommendations_select on public.recommendations for select using (public.same_workshop(workshop_account_id));
create policy recommendations_insert on public.recommendations for insert with check (public.same_workshop(workshop_account_id));
create policy quotes_select on public.quote_uploads for select using (public.same_workshop(workshop_account_id) or exists(select 1 from public.work_orders wo where wo.id = work_order_id and public.is_customer_of_account(wo.customer_account_id)));
create policy quotes_insert on public.quote_uploads for insert with check (public.same_workshop(workshop_account_id));
create policy invoices_select on public.invoice_uploads for select using (public.same_workshop(workshop_account_id) or exists(select 1 from public.work_orders wo where wo.id = work_order_id and public.is_customer_of_account(wo.customer_account_id)));
create policy invoices_insert on public.invoice_uploads for insert with check (public.same_workshop(workshop_account_id));
create policy payments_select on public.payment_proofs for select using (public.same_workshop(workshop_account_id));
create policy payments_insert on public.payment_proofs for insert with check (public.same_workshop(workshop_account_id));
create policy reports_select on public.customer_reports for select using (public.same_workshop(workshop_account_id) or public.is_customer_of_account(customer_account_id));
create policy reports_insert on public.customer_reports for insert with check (public.same_workshop(workshop_account_id) or public.is_customer_of_account(customer_account_id));
create policy attachments_select on public.attachments for select using (public.same_workshop(workshop_account_id));
create policy attachments_insert on public.attachments for insert with check (public.same_workshop(workshop_account_id));
create policy timeline_select on public.timeline_events for select using (public.same_workshop(workshop_account_id) or exists(select 1 from public.vehicles v where v.id = vehicle_id and public.is_customer_of_account(v.current_customer_account_id)));
create policy timeline_insert on public.timeline_events for insert with check (public.same_workshop(workshop_account_id));
create policy audit_select on public.audit_logs for select using (public.same_workshop(workshop_account_id));
create policy audit_insert on public.audit_logs for insert with check (public.same_workshop(workshop_account_id));

create trigger immutable_timeline_update before update or delete on public.timeline_events for each row execute function public.prevent_mutation();
create trigger immutable_inspections_update before update or delete on public.inspections for each row execute function public.prevent_mutation();
create trigger immutable_inspection_items_update before update or delete on public.inspection_items for each row execute function public.prevent_mutation();
create trigger immutable_quotes_update before update or delete on public.quote_uploads for each row execute function public.prevent_mutation();
create trigger immutable_invoices_update before update or delete on public.invoice_uploads for each row execute function public.prevent_mutation();
create trigger immutable_payments_update before update or delete on public.payment_proofs for each row execute function public.prevent_mutation();
create trigger immutable_attachments_update before update or delete on public.attachments for each row execute function public.prevent_mutation();
create trigger immutable_audit_update before update or delete on public.audit_logs for each row execute function public.prevent_mutation();
