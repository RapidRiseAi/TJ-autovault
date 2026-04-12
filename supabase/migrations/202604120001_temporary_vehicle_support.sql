alter table public.vehicles
  add column if not exists is_temporary boolean not null default false,
  add column if not exists archived_at timestamptz;

alter table public.customer_accounts
  add column if not exists temporary_vehicle_limit int not null default 0;

update public.customer_accounts
set temporary_vehicle_limit = case lower(coalesce(tier::text, 'basic'))
  when 'business' then 3
  when 'pro' then 1
  else 0
end
where temporary_vehicle_limit is null
   or temporary_vehicle_limit = 0;

alter table public.customer_accounts
  drop constraint if exists customer_accounts_temporary_vehicle_limit_check;

alter table public.customer_accounts
  add constraint customer_accounts_temporary_vehicle_limit_check
  check (temporary_vehicle_limit >= 0);

create index if not exists vehicles_customer_temporary_idx
  on public.vehicles (current_customer_account_id, is_temporary, archived_at, created_at desc);
