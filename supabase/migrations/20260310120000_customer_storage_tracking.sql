alter table public.customer_accounts
  add column if not exists included_storage_bytes bigint,
  add column if not exists extra_storage_gb integer not null default 0;

update public.customer_accounts
set included_storage_bytes = case
  when tier::text = 'business' then 10::bigint * 1024 * 1024 * 1024
  when tier::text = 'pro' then 1::bigint * 1024 * 1024 * 1024
  else 250::bigint * 1024 * 1024
end
where included_storage_bytes is null;

alter table public.customer_accounts
  alter column included_storage_bytes set not null;

alter table public.customer_accounts
  alter column included_storage_bytes set default (250::bigint * 1024 * 1024);

alter table public.customer_accounts
  drop constraint if exists customer_accounts_included_storage_bytes_check,
  drop constraint if exists customer_accounts_extra_storage_gb_check;

alter table public.customer_accounts
  add constraint customer_accounts_included_storage_bytes_check check (included_storage_bytes >= 0),
  add constraint customer_accounts_extra_storage_gb_check check (extra_storage_gb >= 0);
