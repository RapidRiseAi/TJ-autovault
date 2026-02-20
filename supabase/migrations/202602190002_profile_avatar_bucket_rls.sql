-- Dedicated private bucket for customer profile avatars.
insert into storage.buckets (id, name, public)
values ('profile-avatars', 'profile-avatars', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists "profile avatars self upload" on storage.objects;
create policy "profile avatars self upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = 'profiles'
  and split_part(name, '/', 2)::uuid = auth.uid()
);

drop policy if exists "profile avatars self read" on storage.objects;
create policy "profile avatars self read"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-avatars'
  and split_part(name, '/', 1) = 'profiles'
  and split_part(name, '/', 2)::uuid = auth.uid()
);
