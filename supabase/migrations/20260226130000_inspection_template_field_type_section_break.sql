alter table if exists public.inspection_template_fields
  drop constraint if exists inspection_template_fields_field_type_check;

alter table if exists public.inspection_template_fields
  add constraint inspection_template_fields_field_type_check
  check (field_type in ('checkbox', 'number', 'text', 'dropdown', 'section_break'));
