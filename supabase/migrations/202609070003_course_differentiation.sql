alter table public.courses
  add column if not exists course_differentiation text not null default '';
