create or replace function public.edit_work_task_with_event(
  p_task_id uuid,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_title text,
  p_description text,
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

  update public.work_tasks
  set title = p_title, description = p_description, updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (task_id, actor_id, event_type, metadata)
  values (
    p_task_id,
    p_actor_id,
    'edited',
    jsonb_build_object(
      'previousTitle', current_task.title,
      'title', p_title,
      'previousDescription', current_task.description,
      'description', p_description
    )
  );

  return to_jsonb(changed_task);
end;
$$;

revoke all on function public.edit_work_task_with_event(uuid, uuid, uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.edit_work_task_with_event(uuid, uuid, uuid, text, text, boolean) to service_role;
