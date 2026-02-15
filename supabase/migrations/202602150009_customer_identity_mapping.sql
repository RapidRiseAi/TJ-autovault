alter table public.customer_accounts
add column if not exists auth_user_id uuid references auth.users(id);

create unique index if not exists customer_accounts_auth_user_id_key
on public.customer_accounts (auth_user_id)
where auth_user_id is not null;

create or replace function public.get_my_customer_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ca.id
  from public.customer_accounts ca
  where ca.auth_user_id = auth.uid()
  order by ca.created_at asc
  limit 1;
$$;

alter function public.get_my_customer_account_id() owner to postgres;
revoke all on function public.get_my_customer_account_id() from public;
grant execute on function public.get_my_customer_account_id() to authenticated;

drop policy if exists customer_accounts_insert_self on public.customer_accounts;

create policy customer_accounts_insert_self
on public.customer_accounts
for insert
with check (
  auth.uid() = auth_user_id
  and public.same_workshop(workshop_account_id)
);
