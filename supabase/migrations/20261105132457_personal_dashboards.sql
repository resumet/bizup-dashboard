alter table public.work_tasks
  add column if not exists task_kind text not null default 'daily',
  add column if not exists completion_report text not null default '';

alter table public.work_tasks
  drop constraint if exists work_tasks_status_check;

alter table public.work_tasks
  drop constraint if exists work_tasks_task_kind_check;

alter table public.work_tasks
  add constraint work_tasks_task_kind_check
    check (task_kind in ('daily', 'executive_assignment')),
  add constraint work_tasks_status_check
    check (
      (task_kind = 'daily' and status in ('open', 'done', 'cancelled'))
      or
      (task_kind = 'executive_assignment' and status in ('created', 'assigned', 'completed'))
    ),
  add constraint work_tasks_completion_report_check
    check (char_length(completion_report) <= 5000);

create index if not exists work_tasks_executive_assignment_idx
  on public.work_tasks (workspace_id, task_kind, assignee_id, status, created_at desc);

drop policy if exists work_tasks_member_read on public.work_tasks;

create policy work_tasks_member_read on public.work_tasks
for select to authenticated
using (
  public.is_workspace_member(workspace_id)
  and (
    task_kind = 'daily'
    or assignee_id = (select auth.uid())
    or creator_id = (select auth.uid())
    or exists (
      select 1
      from public.workspace_members member
      where member.workspace_id = work_tasks.workspace_id
        and member.user_id = (select auth.uid())
        and member.role::text = 'super_admin'
    )
  )
);

create table public.personal_dashboard_memos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index personal_dashboard_memos_user_idx
  on public.personal_dashboard_memos (workspace_id, user_id, created_at desc);

alter table public.personal_dashboard_memos enable row level security;

revoke all on table public.personal_dashboard_memos from anon, authenticated;
grant all on table public.personal_dashboard_memos to service_role;

create policy personal_dashboard_memos_own_read
on public.personal_dashboard_memos for select to authenticated
using (
  user_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

create policy personal_dashboard_memos_own_insert
on public.personal_dashboard_memos for insert to authenticated
with check (
  user_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

create policy personal_dashboard_memos_own_update
on public.personal_dashboard_memos for update to authenticated
using (
  user_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
)
with check (
  user_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

create policy personal_dashboard_memos_own_delete
on public.personal_dashboard_memos for delete to authenticated
using (
  user_id = (select auth.uid())
  and public.is_workspace_member(workspace_id)
);

create or replace function public.create_executive_assignment_with_event(
  p_workspace_id uuid,
  p_title text,
  p_planned_date date,
  p_creator_id uuid,
  p_assignee_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  created_task public.work_tasks;
begin
  if char_length(btrim(coalesce(p_title, ''))) not between 1 and 200 then
    raise exception 'INVALID_TITLE';
  end if;

  if not exists (
    select 1
    from public.workspace_members member
    left join auth.users account on account.id = member.user_id
    where member.workspace_id = p_workspace_id
      and member.user_id = p_creator_id
      and (
        member.role::text = 'super_admin'
        or lower(btrim(coalesce(account.email, ''))) = 'resumet@gmail.com'
      )
  ) then
    raise exception 'CREATOR_NOT_SUPER_ADMIN';
  end if;

  if not exists (
    select 1
    from public.workspace_members
    where workspace_id = p_workspace_id
      and user_id = p_assignee_id
  ) then
    raise exception 'ASSIGNEE_NOT_IN_WORKSPACE';
  end if;

  insert into public.work_tasks (
    workspace_id,
    title,
    description,
    planned_date,
    status,
    creator_id,
    assignee_id,
    task_kind
  ) values (
    p_workspace_id,
    btrim(p_title),
    '',
    p_planned_date,
    'assigned',
    p_creator_id,
    p_assignee_id,
    'executive_assignment'
  )
  returning * into created_task;

  insert into public.work_task_events (
    task_id,
    actor_id,
    event_type,
    metadata
  ) values (
    created_task.id,
    p_creator_id,
    'created',
    jsonb_build_object('status', 'created', 'title', created_task.title)
  );

  insert into public.work_task_events (
    task_id,
    actor_id,
    event_type,
    to_assignee_id,
    metadata
  ) values (
    created_task.id,
    p_creator_id,
    'transferred',
    p_assignee_id,
    jsonb_build_object('status', 'assigned')
  );

  return to_jsonb(created_task);
end;
$$;

create or replace function public.set_executive_assignment_status_with_report(
  p_task_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_status text,
  p_completion_report text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_task public.work_tasks;
  changed_task public.work_tasks;
  actor_is_super_admin boolean;
  normalized_report text := btrim(coalesce(p_completion_report, ''));
begin
  if p_status not in ('assigned', 'completed') then
    raise exception 'INVALID_STATUS';
  end if;
  if char_length(normalized_report) > 5000 then
    raise exception 'REPORT_TOO_LONG';
  end if;

  select exists (
    select 1
    from public.workspace_members member
    left join auth.users account on account.id = member.user_id
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_id
      and (
        member.role::text = 'super_admin'
        or lower(btrim(coalesce(account.email, ''))) = 'resumet@gmail.com'
      )
  ) into actor_is_super_admin;

  select * into current_task
  from public.work_tasks
  where id = p_task_id
    and workspace_id = p_workspace_id
    and task_kind = 'executive_assignment'
  for update;

  if not found then
    raise exception 'TASK_NOT_FOUND';
  end if;
  if current_task.assignee_id <> p_actor_id and not actor_is_super_admin then
    raise exception 'TASK_ACCESS_DENIED';
  end if;

  if current_task.status = p_status
    and current_task.completion_report = normalized_report then
    return to_jsonb(current_task);
  end if;

  update public.work_tasks
  set status = p_status,
      completion_report = case
        when p_status = 'completed' then normalized_report
        else completion_report
      end,
      completed_at = case when p_status = 'completed' then now() else null end,
      updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (
    task_id,
    actor_id,
    event_type,
    metadata
  ) values (
    p_task_id,
    p_actor_id,
    case when p_status = 'completed' then 'completed' else 'reopened' end,
    jsonb_build_object(
      'status', p_status,
      'completionReport', case when p_status = 'completed' then normalized_report else current_task.completion_report end
    )
  );

  return to_jsonb(changed_task);
end;
$$;

revoke all on function public.create_executive_assignment_with_event(uuid, text, date, uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.set_executive_assignment_status_with_report(uuid, uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_executive_assignment_with_event(uuid, text, date, uuid, uuid)
  to service_role;
grant execute on function public.set_executive_assignment_status_with_report(uuid, uuid, uuid, text, text)
  to service_role;
