create or replace function public.create_work_task_with_event(
  p_workspace_id uuid,
  p_title text,
  p_description text,
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
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_creator_id
  ) then
    raise exception 'CREATOR_NOT_IN_WORKSPACE';
  end if;

  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_assignee_id
  ) then
    raise exception 'ASSIGNEE_NOT_IN_WORKSPACE';
  end if;

  insert into public.work_tasks (
    workspace_id, title, description, planned_date, creator_id, assignee_id
  ) values (
    p_workspace_id, p_title, p_description, p_planned_date, p_creator_id, p_assignee_id
  ) returning * into created_task;

  insert into public.work_task_events (
    task_id, actor_id, event_type, to_assignee_id, metadata
  ) values (
    created_task.id,
    p_creator_id,
    'created',
    p_assignee_id,
    jsonb_build_object('title', p_title, 'plannedDate', p_planned_date)
  );

  return to_jsonb(created_task);
end;
$$;

create or replace function public.set_work_task_status_with_event(
  p_task_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_status text,
  p_is_admin boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_task public.work_tasks;
  changed_task public.work_tasks;
begin
  if p_status not in ('open', 'done') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into current_task
  from public.work_tasks
  where id = p_task_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if not p_is_admin and current_task.assignee_id <> p_actor_id then
    raise exception 'TASK_ACCESS_DENIED';
  end if;

  if current_task.status = p_status then return to_jsonb(current_task); end if;

  update public.work_tasks
  set status = p_status,
      completed_at = case when p_status = 'done' then now() else null end,
      updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (task_id, actor_id, event_type)
  values (
    p_task_id,
    p_actor_id,
    case when p_status = 'done' then 'completed' else 'reopened' end
  );

  return to_jsonb(changed_task);
end;
$$;

create or replace function public.transfer_work_task_with_event(
  p_task_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_assignee_id uuid,
  p_note text default '',
  p_is_admin boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_task public.work_tasks;
  changed_task public.work_tasks;
begin
  select * into current_task
  from public.work_tasks
  where id = p_task_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if not p_is_admin and current_task.assignee_id <> p_actor_id then
    raise exception 'TASK_ACCESS_DENIED';
  end if;
  if current_task.assignee_id = p_assignee_id then
    raise exception 'ASSIGNEE_UNCHANGED';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_assignee_id
  ) then
    raise exception 'ASSIGNEE_NOT_IN_WORKSPACE';
  end if;

  update public.work_tasks
  set assignee_id = p_assignee_id, updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (
    task_id, actor_id, event_type, from_assignee_id, to_assignee_id, metadata
  ) values (
    p_task_id,
    p_actor_id,
    'transferred',
    current_task.assignee_id,
    p_assignee_id,
    jsonb_build_object('note', coalesce(p_note, ''))
  );

  return to_jsonb(changed_task);
end;
$$;

revoke all on function public.create_work_task_with_event(uuid, text, text, date, uuid, uuid) from public, anon, authenticated;
revoke all on function public.set_work_task_status_with_event(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
revoke all on function public.transfer_work_task_with_event(uuid, uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.create_work_task_with_event(uuid, text, text, date, uuid, uuid) to service_role;
grant execute on function public.set_work_task_status_with_event(uuid, uuid, uuid, text, boolean) to service_role;
grant execute on function public.transfer_work_task_with_event(uuid, uuid, uuid, uuid, text, boolean) to service_role;
