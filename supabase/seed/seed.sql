insert into public.workshop_accounts (id, name, slug, plan)
values ('11111111-1111-1111-1111-111111111111', 'TJ Service & Repairs', 'tj-service-repairs', 'free')
on conflict do nothing;

insert into public.workshop_branding_settings (workshop_account_id, logo_url, primary_color, secondary_color, watermark_enabled, watermark_text)
values (
  '11111111-1111-1111-1111-111111111111',
  'https://example.com/tj-logo.png',
  '#cf2027',
  '#111111',
  true,
  'Powered by Rapid Rise AI'
)
on conflict do nothing;

-- Create admin user in Supabase dashboard auth, then update UUID below.
insert into public.profiles (id, workshop_account_id, role, display_name)
values ('80f7bc23-252e-4334-8b07-a7ad46c3fb56', '11111111-1111-1111-1111-111111111111', 'admin', 'TJ Admin')
on conflict do nothing;

insert into public.customer_accounts (id, workshop_account_id, name, tier)
values ('22222222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'Demo Customer', 'free')
on conflict do nothing;
