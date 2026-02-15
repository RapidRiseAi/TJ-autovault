create policy profiles_self_insert on public.profiles
for insert
with check (id = auth.uid());
