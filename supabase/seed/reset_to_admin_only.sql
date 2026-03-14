-- Reset the database to a clean testing state while preserving one admin account.
--
-- Usage:
--   1) Open the Supabase SQL editor for your project.
--   2) Paste this file and run it as the project owner/service role.
--
-- This script keeps only the auth user with email team@rapidriseai.com and
-- that user's profile/workshop context. All other app data and storage objects
-- are removed.

begin;

DO $$
DECLARE
  v_admin_email constant text := 'team@rapidriseai.com';
  v_admin_user_id uuid;
  v_admin_workshop_id uuid;
  v_tables_to_truncate text;
BEGIN
  select u.id
    into v_admin_user_id
  from auth.users u
  where lower(u.email) = lower(v_admin_email)
  limit 1;

  if v_admin_user_id is null then
    raise exception 'No auth user found for %', v_admin_email;
  end if;

  select p.workshop_account_id
    into v_admin_workshop_id
  from public.profiles p
  where p.id = v_admin_user_id
  limit 1;

  -- Remove every stored file from all buckets.
  delete from storage.objects;

  -- Truncate all domain tables, excluding the admin profile/workshop tables.
  select string_agg(format('%I.%I', schemaname, tablename), ', ')
    into v_tables_to_truncate
  from pg_tables
  where schemaname = 'public'
    and tablename not in ('profiles', 'workshop_accounts', 'workshop_branding_settings');

  if v_tables_to_truncate is not null then
    execute 'truncate table ' || v_tables_to_truncate || ' restart identity cascade';
  end if;

  -- Keep only the admin profile.
  delete from public.profiles
  where id <> v_admin_user_id;

  -- Keep only the admin workshop account (if present).
  if v_admin_workshop_id is null then
    delete from public.workshop_branding_settings;
    delete from public.workshop_accounts;
  else
    delete from public.workshop_branding_settings
    where workshop_account_id <> v_admin_workshop_id;

    delete from public.workshop_accounts
    where id <> v_admin_workshop_id;
  end if;

  -- Keep only the admin auth account.
  delete from auth.users
  where id <> v_admin_user_id;
END $$;

commit;
