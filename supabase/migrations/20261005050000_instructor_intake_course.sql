alter table public.instructor_intakes
  add column course_id uuid references public.courses(id) on delete set null;

create index instructor_intakes_course_idx
  on public.instructor_intakes(course_id);
