alter table public.message_templates
  add column if not exists variable_names jsonb not null default '[]'::jsonb;

update public.message_templates
set variable_names = case
  when applicant_variable = course_variable
    then jsonb_build_array(applicant_variable)
  else jsonb_build_array(applicant_variable, course_variable)
end
where variable_names = '[]'::jsonb;

alter table public.message_templates
  drop constraint if exists message_templates_variable_names_array_check;

alter table public.message_templates
  add constraint message_templates_variable_names_array_check
  check (jsonb_typeof(variable_names) = 'array');
