-- Align legacy support_tickets table shape with workshop support-ticket API expectations.

alter table if exists public.support_tickets
  add column if not exists profile_id uuid references public.profiles(id) on delete set null,
  add column if not exists customer_email text,
  add column if not exists subject text,
  add column if not exists updated_at timestamptz not null default now();

alter table if exists public.support_tickets
  alter column workshop_account_id drop not null,
  alter column customer_account_id drop not null,
  alter column category drop not null;

alter table if exists public.support_tickets
  drop constraint if exists support_tickets_category_check;

create index if not exists support_tickets_workshop_idx
  on public.support_tickets(workshop_account_id, created_at desc);

create index if not exists support_tickets_profile_idx
  on public.support_tickets(profile_id, created_at desc);

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

notify pgrst, 'reload schema';
