alter table public.workspaces
  add column if not exists is_primary boolean not null default false;

create unique index if not exists workspaces_single_primary_idx
  on public.workspaces (is_primary)
  where is_primary;

do $$
declare
  shared_workspace_id uuid;
begin
  select wm.workspace_id
    into shared_workspace_id
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where lower(u.email) = 'resumet@gmail.com'
  order by wm.created_at
  limit 1;

  if shared_workspace_id is not null then
    update public.workspaces
    set is_primary = false
    where id <> shared_workspace_id
      and is_primary;

    update public.workspaces
    set is_primary = true
    where id = shared_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    select
      shared_workspace_id,
      u.id,
      case
        when lower(u.email) = 'resumet@gmail.com' then 'admin'::public.app_role
        else 'operator'::public.app_role
      end
    from auth.users u
    on conflict (workspace_id, user_id)
    do update set role = excluded.role;

    -- 작성자 정보는 유지하고 강의의 소속만 공용 워크스페이스로 통합한다.
    update public.courses
    set workspace_id = shared_workspace_id
    where workspace_id <> shared_workspace_id;

    update public.audit_logs
    set workspace_id = shared_workspace_id
    where workspace_id is not null
      and workspace_id <> shared_workspace_id;

    -- 데이터가 없는 과거 개인 워크스페이스의 멤버십만 정리한다.
    delete from public.workspace_members wm
    where wm.workspace_id <> shared_workspace_id
      and not exists (select 1 from public.course_jobs x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.audit_logs x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.students x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.message_jobs x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.address_books x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.message_templates x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.address_book_message_jobs x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.message_studio_projects x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.courses x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.message_studio_default_templates x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.settlement_reports x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.course_settlement_projects x where x.workspace_id = wm.workspace_id)
      and not exists (select 1 from public.phone_sales_jobs x where x.workspace_id = wm.workspace_id);

    delete from public.workspaces w
    where w.id <> shared_workspace_id
      and not exists (select 1 from public.workspace_members wm where wm.workspace_id = w.id)
      and not exists (select 1 from public.course_jobs x where x.workspace_id = w.id)
      and not exists (select 1 from public.audit_logs x where x.workspace_id = w.id)
      and not exists (select 1 from public.students x where x.workspace_id = w.id)
      and not exists (select 1 from public.message_jobs x where x.workspace_id = w.id)
      and not exists (select 1 from public.address_books x where x.workspace_id = w.id)
      and not exists (select 1 from public.message_templates x where x.workspace_id = w.id)
      and not exists (select 1 from public.address_book_message_jobs x where x.workspace_id = w.id)
      and not exists (select 1 from public.message_studio_projects x where x.workspace_id = w.id)
      and not exists (select 1 from public.courses x where x.workspace_id = w.id)
      and not exists (select 1 from public.message_studio_default_templates x where x.workspace_id = w.id)
      and not exists (select 1 from public.settlement_reports x where x.workspace_id = w.id)
      and not exists (select 1 from public.course_settlement_projects x where x.workspace_id = w.id)
      and not exists (select 1 from public.phone_sales_jobs x where x.workspace_id = w.id);
  end if;
end;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  shared_workspace_id uuid;
  new_workspace_id uuid;
begin
  select w.id
    into shared_workspace_id
  from public.workspaces w
  where w.is_primary
  limit 1;

  if shared_workspace_id is not null then
    insert into public.workspace_members (workspace_id, user_id, role)
    values (
      shared_workspace_id,
      new.id,
      case
        when lower(new.email) = 'resumet@gmail.com' then 'admin'::public.app_role
        else 'operator'::public.app_role
      end
    );
  else
    insert into public.workspaces (name, is_primary)
    values (
      coalesce(
        new.raw_user_meta_data ->> 'workspace_name',
        split_part(new.email, '@', 1) || ' 워크스페이스'
      ),
      lower(new.email) = 'resumet@gmail.com'
    )
    returning id into new_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (new_workspace_id, new.id, 'admin');
  end if;

  return new;
end;
$$;
