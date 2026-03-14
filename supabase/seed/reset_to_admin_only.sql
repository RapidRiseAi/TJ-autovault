-- HARD RESET for client demo handoff.
--
-- Goal: remove all test/demo activity data and keep ONLY real login/workshop identity records.
--
-- Usage:
--   1) Open Supabase -> SQL Editor in the EXACT project you want to clean.
--   2) Set BOTH real emails in v_keep_emails (workshop login + developer login).
--   3) Run this script as project owner / service role.
--
-- Preserved:
--   - auth.users rows for v_keep_emails
--   - matching public.profiles rows
--   - linked public.workshop_accounts + public.workshop_branding_settings
--
-- Deleted:
--   - all other auth users/identities/sessions
--   - all storage objects
--   - all other public-schema app tables (customers, vehicles, quotes, invoices,
--     job cards, timeline entries, notifications, payouts, recurring costs, etc.)

begin;

DO $$
DECLARE
  -- REQUIRED: keep only these real logins.
  -- Replace with your actual emails before running.
  v_keep_emails constant text[] := array[
    'team@rapidriseai.com'
    -- ,'developer@your-domain.com'
  ];

  v_keep_user_ids uuid[];
  v_keep_workshop_ids uuid[];
  v_public_tables_to_truncate text;
  v_remaining_activity_rows bigint;
  v_table_name text;
BEGIN
  -- Resolve keep users.
  select coalesce(array_agg(u.id), array[]::uuid[])
    into v_keep_user_ids
  from auth.users u
  where lower(u.email) = any (
    select lower(email)
    from unnest(v_keep_emails) as email
  );

  if coalesce(array_length(v_keep_user_ids, 1), 0) = 0 then
    raise exception 'No auth users found for keep list: %', v_keep_emails;
  end if;

  -- Resolve linked workshops for keep users.
  select coalesce(array_agg(distinct p.workshop_account_id), array[]::uuid[])
    into v_keep_workshop_ids
  from public.profiles p
  where p.id = any(v_keep_user_ids)
    and p.workshop_account_id is not null;

  -- Remove all uploaded files.
  delete from storage.objects;

  -- Remove all non-kept public domain data.
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into v_public_tables_to_truncate
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('profiles', 'workshop_accounts', 'workshop_branding_settings');

  if v_public_tables_to_truncate is not null then
    execute 'truncate table ' || v_public_tables_to_truncate || ' restart identity cascade';
  end if;

  -- Keep only selected profiles.
  delete from public.profiles
  where not (id = any(v_keep_user_ids));

  -- Keep only selected workshops + branding.
  if coalesce(array_length(v_keep_workshop_ids, 1), 0) = 0 then
    delete from public.workshop_branding_settings;
    delete from public.workshop_accounts;
  else
    delete from public.workshop_branding_settings
    where not (workshop_account_id = any(v_keep_workshop_ids));

    delete from public.workshop_accounts
    where not (id = any(v_keep_workshop_ids));
  end if;

  -- Remove auth side records for all non-kept users (defensive explicit cleanup).
  delete from auth.sessions where not (user_id = any(v_keep_user_ids));
  delete from auth.refresh_tokens where not (user_id = any(v_keep_user_ids));
  delete from auth.identities where not (user_id = any(v_keep_user_ids));
  delete from auth.mfa_factors where not (user_id = any(v_keep_user_ids));

  -- Finally keep only selected auth users.
  delete from auth.users
  where not (id = any(v_keep_user_ids));

  -- Verification guard: if these key tables exist, they must all be empty.
  for v_table_name in
    select unnest(array[
      'customer_accounts',
      'customer_users',
      'vehicles',
      'quotes',
      'invoices',
      'documents',
      'job_cards'
    ]::text[])
  loop
    if to_regclass(format('public.%s', v_table_name)) is not null then
      execute format('select count(*) from public.%I', v_table_name)
        into v_remaining_activity_rows;

      if v_remaining_activity_rows > 0 then
        raise exception 'Reset verification failed: table public.% still has % rows.', v_table_name, v_remaining_activity_rows;
      end if;
    end if;
  end loop;
END $$;

commit;
