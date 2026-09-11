alter table public.job_enrollments
  add column if not exists is_manually_added boolean not null default false;

update public.job_enrollments as enrollment
set is_manually_added = true
where exists (
  select 1
  from public.audit_logs as audit
  where audit.event_type = 'course_job.enrollment_added_manually'
    and audit.entity_id = enrollment.job_id::text
    and audit.metadata ->> 'enrollment_id' = enrollment.id::text
);
