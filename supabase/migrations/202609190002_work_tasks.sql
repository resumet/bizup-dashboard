create table public.work_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  title text not null check (length(trim(title)) between 1 and 200),
  description text not null default '',
  planned_date date not null default current_date,
  status text not null default 'open' check (status in ('open','done','cancelled')),
  creator_id uuid not null references auth.users,
  assignee_id uuid not null references auth.users,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index work_tasks_assignee_date_idx on public.work_tasks(workspace_id, assignee_id, planned_date, status);
create table public.work_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.work_tasks on delete cascade,
  actor_id uuid not null references auth.users,
  event_type text not null check (event_type in ('created','completed','reopened','transferred','edited')),
  from_assignee_id uuid references auth.users,
  to_assignee_id uuid references auth.users,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index work_task_events_task_idx on public.work_task_events(task_id, created_at desc);
alter table public.work_tasks enable row level security;
alter table public.work_task_events enable row level security;
create policy work_tasks_member_access on public.work_tasks for all to authenticated using (public.is_workspace_member(workspace_id)) with check (public.is_workspace_member(workspace_id));
create policy work_task_events_member_access on public.work_task_events for all to authenticated using (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_workspace_member(t.workspace_id))) with check (exists (select 1 from public.work_tasks t where t.id = task_id and public.is_workspace_member(t.workspace_id)));
