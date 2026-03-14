-- Reset the database to a clean client-demo state while preserving selected login(s).
--
-- Usage:
--   1) Open the Supabase SQL editor for your project.
--   2) Paste this file and run it as the project owner/service role.
--
-- Configure v_keep_emails below with the account(s) you want to keep.
-- The script preserves:
--   - matching auth.users row(s)
--   - their profile row(s)
--   - any linked workshop account(s) + branding settings
--
-- Everything else (customers, quotes, invoices, job cards, files, technician accounts,
-- notifications, etc.) is removed.

begin;

DO $$
DECLARE
  -- Keep these login(s). Update as needed before running.
  v_keep_emails constant text[] := array[
    'team@rapidriseai.com'
    -- ,'developer@your-workshop.com'
  ];
  v_keep_user_ids uuid[];
  v_keep_workshop_ids uuid[];
  v_tables_to_truncate text;
BEGIN
  select coalesce(array_agg(u.id), array[]::uuid[])
    into v_keep_user_ids
  from auth.users u
  where lower(u.email) = any (
    select lower(email)
    from unnest(v_keep_emails) as email
  );

  if coalesce(array_length(v_keep_user_ids, 1), 0) = 0 then
    raise exception 'No auth users found for configured keep_emails: %', v_keep_emails;
  end if;

  select coalesce(array_agg(distinct p.workshop_account_id), array[]::uuid[])
    into v_keep_workshop_ids
  from public.profiles p
  where p.id = any(v_keep_user_ids)
    and p.workshop_account_id is not null;

  -- Remove every stored file from all buckets.
  delete from storage.objects;

  -- Truncate all domain tables, excluding tables with kept identities/workshops.
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into v_tables_to_truncate
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('profiles', 'workshop_accounts', 'workshop_branding_settings');

  if v_tables_to_truncate is not null then
    execute 'truncate table ' || v_tables_to_truncate || ' restart identity cascade';
  end if;

  -- Keep only selected profiles.
  delete from public.profiles
  where not (id = any(v_keep_user_ids));

  -- Keep only selected workshop account(s).
  if coalesce(array_length(v_keep_workshop_ids, 1), 0) = 0 then
    delete from public.workshop_branding_settings;
    delete from public.workshop_accounts;
  else
    delete from public.workshop_branding_settings
    where not (workshop_account_id = any(v_keep_workshop_ids));

    delete from public.workshop_accounts
    where not (id = any(v_keep_workshop_ids));
  end if;

  -- Keep only selected auth account(s).
  delete from auth.users
  where not (id = any(v_keep_user_ids));
END $$;

commit;
