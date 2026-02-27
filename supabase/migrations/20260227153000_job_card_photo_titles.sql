alter table public.job_card_photos
  add column if not exists title text;

update public.job_card_photos
set title = case
  when kind = 'before' then 'Before image'
  when kind = 'after' then 'After image'
  else 'Job image'
end
where coalesce(trim(title), '') = '';

alter table public.job_card_photos
  alter column title set not null;
