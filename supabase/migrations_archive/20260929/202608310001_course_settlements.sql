create table if not exists public.course_settlement_projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  course_id uuid not null references public.courses on delete cascade,
  name text not null,
  starts_on date,
  ends_on date,
  settlement_months text[] not null default '{}',
  manager_name text not null default '',
  memo text not null default '',
  status text not null default '자료대기' check (status in ('자료대기','자료업로드','검증필요','검증완료','비용입력중','정산검토','정산확정','지급완료')),
  instructor_ratio_bps integer not null default 5000 check (instructor_ratio_bps between 0 and 10000),
  latest_version integer not null default 0,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id)
);

create table if not exists public.course_settlement_uploads (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.course_settlement_projects on delete cascade,
  source_type text not null check (source_type in ('nova','payment')),
  original_filename text not null,
  checksum_sha256 text not null,
  batch_id uuid not null default gen_random_uuid(),
  part_number integer not null default 1 check (part_number > 0),
  part_count integer not null default 1 check (part_count > 0 and part_number <= part_count),
  row_count integer not null check (row_count > 0),
  settlement_months text[] not null default '{}',
  rows jsonb not null check (jsonb_typeof(rows) = 'array'),
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  unique (settlement_id, source_type, checksum_sha256)
);

create table if not exists public.course_settlement_expenses (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.course_settlement_projects on delete cascade,
  name text not null,
  burden text not null check (burden in ('company','instructor','shared')),
  amount bigint not null check (amount >= 0),
  occurred_on date,
  manager_name text not null default '',
  note text not null default '',
  evidence_required boolean not null default false,
  evidence_type text not null default '',
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_settlement_expense_attachments (
  id uuid primary key default gen_random_uuid(),
  expense_id uuid not null references public.course_settlement_expenses on delete cascade,
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size bigint not null check (file_size > 0),
  uploaded_by uuid not null references auth.users,
  created_at timestamptz not null default now()
);

create table if not exists public.course_settlement_versions (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.course_settlement_projects on delete cascade,
  version integer not null,
  input_snapshot jsonb not null,
  result_snapshot jsonb not null,
  reason text not null default '',
  status text not null default 'draft' check (status in ('draft','confirmed','reopened')),
  calculated_by uuid not null references auth.users,
  calculated_at timestamptz not null default now(),
  confirmed_by uuid references auth.users,
  confirmed_at timestamptz,
  unique (settlement_id, version)
);

create index if not exists course_settlement_projects_workspace_idx on public.course_settlement_projects (workspace_id, updated_at desc);
create index if not exists course_settlement_uploads_project_idx on public.course_settlement_uploads (settlement_id, created_at desc);
create index if not exists course_settlement_uploads_batch_idx on public.course_settlement_uploads (settlement_id, batch_id, part_number);
create index if not exists course_settlement_expenses_project_idx on public.course_settlement_expenses (settlement_id, burden, created_at);
create index if not exists course_settlement_versions_project_idx on public.course_settlement_versions (settlement_id, version desc);

alter table public.course_settlement_projects enable row level security;
alter table public.course_settlement_uploads enable row level security;
alter table public.course_settlement_expenses enable row level security;
alter table public.course_settlement_expense_attachments enable row level security;
alter table public.course_settlement_versions enable row level security;

create policy "members manage course settlement projects" on public.course_settlement_projects for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());
create policy "members manage course settlement uploads" on public.course_settlement_uploads for all to authenticated
  using (exists (select 1 from public.course_settlement_projects p where p.id = settlement_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.course_settlement_projects p where p.id = settlement_id and public.is_workspace_member(p.workspace_id)) and uploaded_by = auth.uid());
create policy "members manage course settlement expenses" on public.course_settlement_expenses for all to authenticated
  using (exists (select 1 from public.course_settlement_projects p where p.id = settlement_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.course_settlement_projects p where p.id = settlement_id and public.is_workspace_member(p.workspace_id)) and created_by = auth.uid());
create policy "members manage settlement expense attachments" on public.course_settlement_expense_attachments for all to authenticated
  using (exists (select 1 from public.course_settlement_expenses e join public.course_settlement_projects p on p.id = e.settlement_id where e.id = expense_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.course_settlement_expenses e join public.course_settlement_projects p on p.id = e.settlement_id where e.id = expense_id and public.is_workspace_member(p.workspace_id)) and uploaded_by = auth.uid());
create policy "members manage course settlement versions" on public.course_settlement_versions for all to authenticated
  using (exists (select 1 from public.course_settlement_projects p where p.id = settlement_id and public.is_workspace_member(p.workspace_id)))
  with check (exists (select 1 from public.course_settlement_projects p where p.id = settlement_id and public.is_workspace_member(p.workspace_id)) and calculated_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('settlement-evidence', 'settlement-evidence', false, 20971520, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "members read settlement evidence" on storage.objects for select to authenticated
  using (bucket_id = 'settlement-evidence' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
create policy "members upload settlement evidence" on storage.objects for insert to authenticated
  with check (bucket_id = 'settlement-evidence' and public.is_workspace_member(((storage.foldername(name))[1])::uuid));
