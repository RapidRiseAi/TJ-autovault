alter table public.job_cards
  add column if not exists quote_id uuid;

create index if not exists job_cards_quote_id_idx
  on public.job_cards(quote_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_attribute a on a.attrelid = t.oid
      and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and n.nspname = 'public'
      and t.relname = 'job_cards'
      and a.attname = 'quote_id'
  ) then
    alter table public.job_cards
      add constraint job_cards_quote_id_fkey
      foreign key (quote_id)
      references public.quotes(id)
      on delete set null;
  end if;
end
$$;

select pg_notify('pgrst', 'reload schema');
