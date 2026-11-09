-- Allow an existing super administrator to grant or revoke the workspace-level
-- super administrator role. The bootstrap account remains protected.
create or replace function public.set_user_account_role(
  target_user_id uuid,
  target_role public.app_role
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_workspace_id uuid;
begin
  if target_role not in (
    'super_admin'::public.app_role,
    'admin'::public.app_role,
    'user'::public.app_role
  ) then
    raise exception '지원하지 않는 사용자 권한입니다.';
  end if;

  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception '변경할 사용자를 찾을 수 없습니다.';
  end if;

  if exists (
    select 1
    from auth.users u
    where u.id = target_user_id
      and lower(u.email) = 'resumet@gmail.com'
  ) then
    raise exception '기본 최고관리자 권한은 변경할 수 없습니다.';
  end if;

  select w.id
    into shared_workspace_id
  from public.workspaces w
  where w.is_primary
  limit 1;

  if shared_workspace_id is null then
    raise exception '기본 워크스페이스를 찾을 수 없습니다.';
  end if;

  update public.workspace_members
  set role = target_role
  where user_id = target_user_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (shared_workspace_id, target_user_id, target_role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;

  return shared_workspace_id;
end;
$$;

revoke all on function public.set_user_account_role(uuid, public.app_role) from public;
grant execute on function public.set_user_account_role(uuid, public.app_role) to service_role;
