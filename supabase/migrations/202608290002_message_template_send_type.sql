alter table public.message_templates
  add column if not exists send_type text not null default 'at';

update public.message_templates
set send_type = lower(trim(send_type))
where send_type <> lower(trim(send_type));

alter table public.message_templates
  drop constraint if exists message_templates_send_type_not_empty_check;

alter table public.message_templates
  add constraint message_templates_send_type_not_empty_check
  check (length(trim(send_type)) > 0);
