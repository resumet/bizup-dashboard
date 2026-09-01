create table if not exists public.course_job_notes (
  id uuid primary key default gen_random_uuid(),
  course_job_id uuid not null references public.course_jobs on delete cascade,
  content text not null check (char_length(content) between 1 and 2000),
  created_by uuid not null references auth.users,
  author_email text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists course_job_notes_job_created_idx
  on public.course_job_notes (course_job_id, created_at desc);

alter table public.course_job_notes enable row level security;

create policy "members read course job notes"
  on public.course_job_notes for select to authenticated
  using (
    exists (
      select 1
      from public.course_jobs j
      where j.id = course_job_id
        and public.is_workspace_member(j.workspace_id)
    )
  );

create policy "members create own course job notes"
  on public.course_job_notes for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.course_jobs j
      where j.id = course_job_id
        and public.is_workspace_member(j.workspace_id)
    )
  );

create policy "authors update own course job notes"
  on public.course_job_notes for update to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1
      from public.course_jobs j
      where j.id = course_job_id
        and public.is_workspace_member(j.workspace_id)
    )
  )
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.course_jobs j
      where j.id = course_job_id
        and public.is_workspace_member(j.workspace_id)
    )
  );

create policy "authors delete own course job notes"
  on public.course_job_notes for delete to authenticated
  using (
    created_by = auth.uid()
    and exists (
      select 1
      from public.course_jobs j
      where j.id = course_job_id
        and public.is_workspace_member(j.workspace_id)
    )
  );
