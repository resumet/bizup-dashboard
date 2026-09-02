alter table public.job_enrollments
  add column if not exists is_extra_participant boolean not null default false;
