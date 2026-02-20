-- Allow workshop staff/admin to read private customer avatars for linked customer accounts.
-- Bucket remains private and customer self upload/read policies remain intact.

drop policy if exists "profile avatars workshop linked read" on storage.objects;
create policy "profile avatars workshop linked read"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = 'profiles'
  and exists (
    select 1
    from public.profiles actor
    join public.customer_users cu
      on cu.profile_id = split_part(name, '/', 2)::uuid
    join public.customer_accounts ca
      on ca.id = cu.customer_account_id
    where actor.id = auth.uid()
      and actor.role in ('admin', 'technician')
      and actor.workshop_account_id is not null
      and ca.workshop_account_id = actor.workshop_account_id
  )
);
