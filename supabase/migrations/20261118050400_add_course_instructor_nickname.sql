alter table public.courses
  add column instructor_nickname text not null default ''
  constraint courses_instructor_nickname_length_check check (char_length(instructor_nickname) <= 120);
