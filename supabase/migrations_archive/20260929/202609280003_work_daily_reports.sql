create table if not exists public.work_daily_reports (
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  work_date date not null,
  content text not null default '' check (char_length(content) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id, work_date)
);

create index if not exists work_daily_reports_workspace_date_idx
  on public.work_daily_reports (workspace_id, work_date desc, user_id);

alter table public.work_daily_reports enable row level security;

drop policy if exists work_daily_reports_member_read on public.work_daily_reports;
create policy work_daily_reports_member_read on public.work_daily_reports
  for select to authenticated
  using (public.is_workspace_member(workspace_id) and public.personnel_is_active(workspace_id));

drop policy if exists work_daily_reports_own_insert on public.work_daily_reports;
create policy work_daily_reports_own_insert on public.work_daily_reports
  for insert to authenticated
  with check (public.is_workspace_member(workspace_id) and public.personnel_is_active(workspace_id) and user_id = auth.uid());

drop policy if exists work_daily_reports_own_update on public.work_daily_reports;
create policy work_daily_reports_own_update on public.work_daily_reports
  for update to authenticated
  using (public.is_workspace_member(workspace_id) and public.personnel_is_active(workspace_id) and user_id = auth.uid())
  with check (public.is_workspace_member(workspace_id) and public.personnel_is_active(workspace_id) and user_id = auth.uid());

grant select, insert, update on public.work_daily_reports to authenticated;
grant all on public.work_daily_reports to service_role;

notify pgrst, 'reload schema';
