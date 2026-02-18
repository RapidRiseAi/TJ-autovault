-- Remove ambiguous push_notification overload and keep a single canonical signature.

drop function if exists public.push_notification(uuid, uuid, text, text, text, text);

create or replace function public.push_notification(
  p_workshop_account_id uuid,
  p_to_customer_account_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_data jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(workshop_account_id,to_profile_id,to_customer_account_id,kind,title,body,href,data)
  values (
    p_workshop_account_id,
    (
      select cu.profile_id
      from public.customer_users cu
      where cu.customer_account_id = p_to_customer_account_id
      order by cu.created_at asc
      limit 1
    ),
    p_to_customer_account_id,
    p_kind,
    p_title,
    p_body,
    p_href,
    coalesce(p_data, '{}'::jsonb)
  );
end;
$$;

notify pgrst, 'reload schema';
