alter table public.profiles
  add column if not exists daily_wage_cents integer not null default 0,
  add column if not exists signature_text text;

create table if not exists public.technician_attendance (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  technician_profile_id uuid not null references public.profiles(id) on delete cascade,
  worked_on date not null,
  clocked_in boolean not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (technician_profile_id, worked_on)
);

create table if not exists public.technician_payouts (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid not null references public.workshop_accounts(id) on delete cascade,
  technician_profile_id uuid not null references public.profiles(id) on delete cascade,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'pending_confirmation' check (status in ('pending_confirmation','confirmed','rejected')),
  proof_bucket text,
  proof_path text,
  paid_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists technician_attendance_workshop_idx
  on public.technician_attendance (workshop_account_id, technician_profile_id, worked_on desc);
create index if not exists technician_payouts_workshop_idx
  on public.technician_payouts (workshop_account_id, technician_profile_id, paid_at desc);

alter table public.technician_attendance enable row level security;
alter table public.technician_payouts enable row level security;

drop policy if exists technician_attendance_staff_select on public.technician_attendance;
create policy technician_attendance_staff_select
on public.technician_attendance for select to authenticated
using (
  public.is_workshop_staff_for(workshop_account_id)
  or technician_profile_id = auth.uid()
);

drop policy if exists technician_attendance_staff_insert on public.technician_attendance;
create policy technician_attendance_staff_insert
on public.technician_attendance for insert to authenticated
with check (
  public.is_workshop_staff_for(workshop_account_id)
  or technician_profile_id = auth.uid()
);

drop policy if exists technician_attendance_staff_update on public.technician_attendance;
create policy technician_attendance_staff_update
on public.technician_attendance for update to authenticated
using (public.is_workshop_staff_for(workshop_account_id) or technician_profile_id = auth.uid())
with check (public.is_workshop_staff_for(workshop_account_id) or technician_profile_id = auth.uid());

drop policy if exists technician_payouts_staff_select on public.technician_payouts;
create policy technician_payouts_staff_select
on public.technician_payouts for select to authenticated
using (
  public.is_workshop_staff_for(workshop_account_id)
  or technician_profile_id = auth.uid()
);

drop policy if exists technician_payouts_admin_insert on public.technician_payouts;
create policy technician_payouts_admin_insert
on public.technician_payouts for insert to authenticated
with check (public.is_workshop_admin_for(workshop_account_id));

drop policy if exists technician_payouts_update on public.technician_payouts;
create policy technician_payouts_update
on public.technician_payouts for update to authenticated
using (
  public.is_workshop_admin_for(workshop_account_id)
  or technician_profile_id = auth.uid()
)
with check (
  public.is_workshop_admin_for(workshop_account_id)
  or technician_profile_id = auth.uid()
);
