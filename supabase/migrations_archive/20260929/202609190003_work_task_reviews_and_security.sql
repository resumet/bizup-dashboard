drop policy if exists work_tasks_member_access on public.work_tasks;
drop policy if exists work_task_events_member_access on public.work_task_events;

create policy work_tasks_member_read on public.work_tasks
for select to authenticated
using (public.is_workspace_member(workspace_id));

create policy work_task_events_member_read on public.work_task_events
for select to authenticated
using (
  exists (
    select 1
    from public.work_tasks task
    where task.id = task_id
      and public.is_workspace_member(task.workspace_id)
  )
);

create table if not exists public.work_daily_reviews (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  work_date date not null,
  incomplete_count integer not null default 0 check (incomplete_count >= 0),
  checked_out_at timestamptz not null default now(),
  unique (workspace_id, user_id, work_date)
);

create index if not exists work_daily_reviews_user_date_idx
on public.work_daily_reviews(workspace_id, user_id, work_date desc);

alter table public.work_daily_reviews enable row level security;

create policy work_daily_reviews_member_read on public.work_daily_reviews
for select to authenticated
using (public.is_workspace_member(workspace_id));
