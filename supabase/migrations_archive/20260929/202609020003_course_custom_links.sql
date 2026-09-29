alter table public.courses
  add column if not exists custom_links jsonb not null default '[]'::jsonb;

alter table public.courses
  drop constraint if exists courses_custom_links_array_check;

alter table public.courses
  add constraint courses_custom_links_array_check
  check (jsonb_typeof(custom_links) = 'array');
