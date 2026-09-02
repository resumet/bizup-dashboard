alter table public.courses
  add column if not exists landing_page_link text not null default '';
