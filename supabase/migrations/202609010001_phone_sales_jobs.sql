create table if not exists public.phone_sales_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  instructor_name text not null,
  free_filenames text[] not null default '{}'::text[],
  paid_filenames text[] not null default '{}'::text[],
  free_count integer not null default 0,
  paid_count integer not null default 0,
  excluded_count integer not null default 0,
  result_count integer not null default 0,
  contacts jsonb not null default '[]'::jsonb,
  created_by uuid not null references auth.users,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.phone_sales_jobs enable row level security;

create index if not exists phone_sales_jobs_workspace_updated_idx
  on public.phone_sales_jobs (workspace_id, updated_at desc);

drop policy if exists "members read phone sales jobs" on public.phone_sales_jobs;
create policy "members read phone sales jobs"
  on public.phone_sales_jobs
  for select
  to authenticated
  using (public.is_workspace_member(workspace_id));

drop policy if exists "members create phone sales jobs" on public.phone_sales_jobs;
create policy "members create phone sales jobs"
  on public.phone_sales_jobs
  for insert
  to authenticated
  with check (public.is_workspace_member(workspace_id) and created_by = auth.uid());

drop policy if exists "members update phone sales jobs" on public.phone_sales_jobs;
create policy "members update phone sales jobs"
  on public.phone_sales_jobs
  for update
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "members delete phone sales jobs" on public.phone_sales_jobs;
create policy "members delete phone sales jobs"
  on public.phone_sales_jobs
  for delete
  to authenticated
  using (public.is_workspace_member(workspace_id));

insert into public.services (service_key, title, description, icon, route, status, display_order)
values (
  'phone-sales-list',
  '전화세일즈 명단 만들기',
  '무료강의 신청자에서 유료강의 신청자를 제외해 전화 세일즈 명단을 만듭니다.',
  'phone-call',
  '/services/phone-sales-list',
  'active',
  35
)
on conflict (service_key) do update
set title = excluded.title,
    description = excluded.description,
    icon = excluded.icon,
    route = excluded.route,
    status = excluded.status,
    display_order = excluded.display_order;
