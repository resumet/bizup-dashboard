alter table public.course_settlement_projects
  add column if not exists analysis_snapshot jsonb,
  add column if not exists statement_draft jsonb not null default '{}'::jsonb;

alter table public.course_settlement_uploads
  drop constraint if exists course_settlement_uploads_source_type_check;

alter table public.course_settlement_uploads
  add constraint course_settlement_uploads_source_type_check
    check (source_type in ('nova', 'payment', 'workbook')),
  add column if not exists storage_path text,
  add column if not exists analysis_snapshot jsonb,
  add column if not exists is_active boolean not null default true,
  add column if not exists replaced_at timestamptz;

create index if not exists course_settlement_uploads_active_idx
  on public.course_settlement_uploads (settlement_id, is_active, created_at desc);

create table if not exists public.course_settlement_draft_attachments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.course_settlement_projects on delete cascade,
  cost_id text not null check (length(cost_id) between 1 and 200),
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);

create index if not exists course_settlement_draft_attachments_cost_idx
  on public.course_settlement_draft_attachments (settlement_id, cost_id, created_at);

alter table public.course_settlement_draft_attachments enable row level security;

create policy "members manage course settlement draft attachments"
  on public.course_settlement_draft_attachments
  for all to authenticated
  using (
    exists (
      select 1
      from public.course_settlement_projects p
      where p.id = settlement_id
        and public.is_workspace_member(p.workspace_id)
    )
  )
  with check (
    exists (
      select 1
      from public.course_settlement_projects p
      where p.id = settlement_id
        and public.is_workspace_member(p.workspace_id)
    )
    and uploaded_by = auth.uid()
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'course-settlement-files',
  'course-settlement-files',
  false,
  26214400,
  array['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "members read course settlement files"
  on storage.objects
  for select to authenticated
  using (
    bucket_id = 'course-settlement-files'
    and public.is_workspace_member(((storage.foldername(name))[1])::uuid)
  );

notify pgrst, 'reload schema';
