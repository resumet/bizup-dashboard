alter table public.address_book_message_jobs
  alter column address_book_id drop not null,
  add column course_job_id uuid references public.course_jobs on delete cascade,
  add column course_job_version integer;

alter table public.address_book_message_jobs
  add constraint address_message_source_check check (
    (address_book_id is not null and course_job_id is null and course_job_version is null)
    or (address_book_id is null and course_job_id is not null and course_job_version is not null)
  );

create index address_book_message_jobs_course_job_idx
  on public.address_book_message_jobs(course_job_id) where course_job_id is not null;
