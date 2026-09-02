-- 계정 권한은 공용 워크스페이스 역할로 관리한다.
-- resumet@gmail.com은 최고관리자, admin은 관리자, 나머지는 사용자다.
alter table public.workspaces
  add column if not exists is_primary boolean not null default false;

create unique index if not exists workspaces_single_primary_idx
  on public.workspaces (is_primary)
  where is_primary;

alter table public.workspace_members
  alter column role set default 'user'::public.app_role;

alter table public.services
  alter column allowed_roles set default
    array['super_admin', 'admin', 'user']::public.app_role[];

update public.services
set allowed_roles = array['super_admin', 'admin', 'user']::public.app_role[];

do $$
declare
  shared_workspace_id uuid;
begin
  select w.id
    into shared_workspace_id
  from public.workspaces w
  where w.is_primary
  limit 1;

  if shared_workspace_id is null then
    select wm.workspace_id
      into shared_workspace_id
    from public.workspace_members wm
    join auth.users u on u.id = wm.user_id
    where lower(u.email) = 'resumet@gmail.com'
    order by wm.created_at
    limit 1;
  end if;

  if shared_workspace_id is null then
    select w.id
      into shared_workspace_id
    from public.workspaces w
    order by w.created_at
    limit 1;
  end if;

  if shared_workspace_id is null then
    insert into public.workspaces (name, is_primary)
    values ('BizUp 공용 워크스페이스', true)
    returning id into shared_workspace_id;
  else
    update public.workspaces
    set is_primary = false
    where id <> shared_workspace_id
      and is_primary;

    update public.workspaces
    set is_primary = true
    where id = shared_workspace_id;
  end if;

  update public.workspace_members wm
  set role = case
    when lower(u.email) = 'resumet@gmail.com' then 'super_admin'::public.app_role
    else 'user'::public.app_role
  end
  from auth.users u
  where u.id = wm.user_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  select
    shared_workspace_id,
    u.id,
    case
      when lower(u.email) = 'resumet@gmail.com' then 'super_admin'::public.app_role
      else 'user'::public.app_role
    end
  from auth.users u
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;
end;
$$;

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
  if target_role not in ('admin'::public.app_role, 'user'::public.app_role) then
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
    raise exception '최고관리자 권한은 변경할 수 없습니다.';
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

revoke all on function public.set_user_account_role(uuid, public.app_role)
  from public, anon, authenticated;
grant execute on function public.set_user_account_role(uuid, public.app_role)
  to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_workspace_id uuid;
begin
  select w.id
    into shared_workspace_id
  from public.workspaces w
  where w.is_primary
  limit 1;

  if shared_workspace_id is null then
    insert into public.workspaces (name, is_primary)
    values (
      coalesce(
        new.raw_user_meta_data ->> 'workspace_name',
        split_part(new.email, '@', 1) || ' 워크스페이스'
      ),
      true
    )
    returning id into shared_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (
    shared_workspace_id,
    new.id,
    case
      when lower(new.email) = 'resumet@gmail.com' then 'super_admin'::public.app_role
      else 'user'::public.app_role
    end
  );

  return new;
end;
$$;

notify pgrst, 'reload schema';
