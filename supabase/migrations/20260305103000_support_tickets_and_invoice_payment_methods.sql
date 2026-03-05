-- Support tickets submitted from workshop profile settings
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  workshop_account_id uuid references public.workshop_accounts(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  customer_email text,
  subject text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'resolved')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_workshop_idx
  on public.support_tickets(workshop_account_id, created_at desc);

do $$
begin
  if to_regprocedure('public.set_updated_at()') is not null then
    drop trigger if exists support_tickets_set_updated_at on public.support_tickets;

    create trigger support_tickets_set_updated_at
    before update on public.support_tickets
    for each row execute function public.set_updated_at();
  end if;
end
$$;

alter table public.support_tickets enable row level security;

drop policy if exists "support_tickets_select_own_workshop" on public.support_tickets;
create policy "support_tickets_select_own_workshop"
on public.support_tickets
for select
using (
  public.get_my_role() = 'admin'
  and workshop_account_id = public.get_my_workshop_account_id()
);

drop policy if exists "support_tickets_insert_own_workshop" on public.support_tickets;
create policy "support_tickets_insert_own_workshop"
on public.support_tickets
for insert
with check (
  workshop_account_id = public.get_my_workshop_account_id()
);

-- Track how invoice was paid (cash, eft, card, etc.)
alter table public.invoices
  add column if not exists payment_method text;
