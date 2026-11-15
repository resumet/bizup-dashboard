alter table public.course_free_students
  add column applicant_count integer generated always as (jsonb_array_length(rows)) stored;
