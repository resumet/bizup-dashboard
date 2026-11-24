-- Retain only the access restriction when a departed employee's HR file is erased.
create table personnel_private.departed_accounts (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (workspace_id, user_id)
);
revoke all on personnel_private.departed_accounts from public, anon, authenticated, service_role;

create or replace function public.personnel_access(p_workspace_id uuid, p_user_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select from public.workspace_members where workspace_id = p_workspace_id and user_id = p_user_id)
    and coalesce(
      (select status = 'employed' from personnel_private.employees where workspace_id = p_workspace_id and user_id = p_user_id),
      not exists (select from personnel_private.departed_accounts where workspace_id = p_workspace_id and user_id = p_user_id)
    );
$$;

create or replace function public.personnel_directory(p_workspace_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(to_jsonb(person)), '[]'::jsonb) from (
    select user_id, name, status = 'employed' as active from personnel_private.employees
    where workspace_id = p_workspace_id and user_id is not null
    union all
    select d.user_id, null, false from personnel_private.departed_accounts d
    where d.workspace_id = p_workspace_id and not exists (
      select from personnel_private.employees e where e.workspace_id = d.workspace_id and e.user_id = d.user_id
    )
  ) person;
$$;

create function personnel_private.delete_employee(
  p_workspace_id uuid, p_actor_id uuid, p_id uuid, p_expected_version integer, p_confirmation_name text
) returns void language plpgsql security definer set search_path = '' as $$
declare
  employee personnel_private.employees;
begin
  perform 1 from public.workspaces where id = p_workspace_id for update;
  perform personnel_private.assert_admin(p_workspace_id, p_actor_id);
  if not public.personnel_access(p_workspace_id, p_actor_id) then
    raise sqlstate 'PT403' using message = '임직원 삭제 권한이 없습니다.';
  end if;
  select * into employee from personnel_private.employees where workspace_id = p_workspace_id and id = p_id for update;
  if not found then raise sqlstate 'PT404' using message = '삭제할 임직원을 찾을 수 없습니다.'; end if;
  if employee.user_id = p_actor_id then raise sqlstate 'PT409' using message = '본인의 인사기록은 삭제할 수 없습니다.'; end if;
  if employee.version is distinct from p_expected_version then
    raise sqlstate 'PT409' using message = '인사정보가 변경되었습니다. 상세 화면을 다시 열어 확인해 주세요.';
  end if;
  if employee.name is distinct from p_confirmation_name or coalesce(p_confirmation_name, '') = '' then
    raise sqlstate 'PT400' using message = '임직원 이름이 일치하지 않습니다.';
  end if;

  if employee.user_id is not null then
    if employee.status = 'employed' then
      delete from personnel_private.departed_accounts where workspace_id = p_workspace_id and user_id = employee.user_id;
    else
      insert into personnel_private.departed_accounts values (p_workspace_id, employee.user_id) on conflict do nothing;
    end if;
  end if;
  delete from personnel_private.events where employee_id = p_id;
  delete from personnel_private.periods where employee_id = p_id;
  delete from personnel_private.employees where id = p_id and workspace_id = p_workspace_id;
end;
$$;

revoke all on function personnel_private.delete_employee(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant usage on schema personnel_private to service_role;
grant execute on function personnel_private.delete_employee(uuid, uuid, uuid, integer, text) to service_role;

create function public.personnel_delete(
  p_workspace_id uuid, p_actor_id uuid, p_id uuid, p_expected_version integer, p_confirmation_name text
) returns void language sql security invoker set search_path = '' as $$
  select personnel_private.delete_employee(p_workspace_id, p_actor_id, p_id, p_expected_version, p_confirmation_name);
$$;
revoke all on function public.personnel_delete(uuid, uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.personnel_delete(uuid, uuid, uuid, integer, text) to service_role;
