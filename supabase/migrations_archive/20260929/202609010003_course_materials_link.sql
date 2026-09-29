alter table public.courses
  add column if not exists course_materials_link text not null default '';
