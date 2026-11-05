create or replace function personnel_private.guard_task()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform 1 from public.workspaces where id = new.workspace_id for update;

  if (
    (new.task_kind = 'daily' and new.status = 'open')
    or (new.task_kind = 'executive_assignment' and new.status = 'assigned')
  ) and not public.personnel_access(new.workspace_id, new.assignee_id) then
    raise sqlstate 'PT409' using message = '퇴직한 직원에게 업무를 배정할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists personnel_task_guard on public.work_tasks;

create trigger personnel_task_guard
before insert or update on public.work_tasks
for each row
execute function personnel_private.guard_task();

create or replace function personnel_private.guard_executive_assignment_offboarding()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.status = 'employed'
    and new.status <> 'employed'
    and new.user_id is not null
    and exists (
      select 1
      from public.work_tasks task
      where task.workspace_id = new.workspace_id
        and task.assignee_id = new.user_id
        and task.task_kind = 'executive_assignment'
        and task.status = 'assigned'
    ) then
    raise sqlstate 'PT409' using message = '미완료 업무를 먼저 완료하거나 이관해 주세요.';
  end if;

  return new;
end;
$$;

drop trigger if exists personnel_executive_assignment_offboarding_guard
  on personnel_private.employees;

create trigger personnel_executive_assignment_offboarding_guard
before update of status on personnel_private.employees
for each row
execute function personnel_private.guard_executive_assignment_offboarding();

revoke all on function personnel_private.guard_task()
  from public, anon, authenticated, service_role;
revoke all on function personnel_private.guard_executive_assignment_offboarding()
  from public, anon, authenticated, service_role;
