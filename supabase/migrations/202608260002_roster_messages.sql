create unique index if not exists job_enrollments_job_version_row_idx
  on public.job_enrollments (job_id, version, source_row_number);

create table if not exists public.message_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  course_job_id uuid not null references public.course_jobs on delete cascade,
  job_version integer not null,
  template_key text not null check (template_key in ('paid_confirm', 'paid_invite')),
  template_code text not null,
  target_scope text not null check (target_scope in ('all', 'filtered', 'selected')),
  idempotency_key text not null unique,
  status text not null default 'processing' check (status in ('processing', 'completed', 'partial_failed', 'failed')),
  requested_by uuid not null references auth.users,
  requested_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.message_recipients (
  id uuid primary key default gen_random_uuid(),
  message_job_id uuid not null references public.message_jobs on delete cascade,
  enrollment_id uuid not null references public.job_enrollments on delete cascade,
  normalized_phone text not null,
  status text not null default 'pending' check (status in ('pending', 'success', 'failed', 'unknown')),
  http_status integer,
  shoong_code text,
  group_id text,
  message_id text,
  failure_reason text,
  requested_at timestamptz,
  completed_at timestamptz,
  unique (message_job_id, enrollment_id)
);

create index if not exists message_jobs_course_job_created_idx on public.message_jobs (course_job_id, created_at desc);
create index if not exists message_recipients_job_status_idx on public.message_recipients (message_job_id, status);

alter table public.message_jobs enable row level security;
alter table public.message_recipients enable row level security;

create policy "members read message jobs" on public.message_jobs for select to authenticated
  using (public.is_workspace_member(workspace_id));
create policy "members read message recipients" on public.message_recipients for select to authenticated
  using (exists(select 1 from public.message_jobs j where j.id = message_job_id and public.is_workspace_member(j.workspace_id)));

