alter table public.courses
  add column if not exists cohort text not null default '',
  add column if not exists nova_settled boolean not null default false,
  add column if not exists instructor_settled boolean not null default false;
