create table public.instagram_management_checklists (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  items jsonb not null default '[{"id":"kim-suna-login","title":"김선아님 로그인 했는지","completed":false},{"id":"shin-yeyoung-blue-badge","title":"신예영님 블루뱃지 받았는지","completed":false},{"id":"shin-yeyoung-video","title":"신예영님 영상 올라온거 확인됐는지","completed":false},{"id":"shin-yeyoung-filming-date","title":"신예영님 촬영 일자 확정했는지","completed":false}]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint instagram_management_checklists_items_array_check
    check (jsonb_typeof(items) = 'array')
);

comment on table public.instagram_management_checklists is
  '워크스페이스 공용 인스타그램 관리 할 일과 완료 상태';

alter table public.instagram_management_checklists enable row level security;
revoke all on table public.instagram_management_checklists from public, anon, authenticated;
grant select, insert, update, delete on table public.instagram_management_checklists to service_role;

alter table public.course_instagram_materials
  add column dm_not_required boolean not null default false;

comment on column public.course_instagram_materials.dm_not_required is
  'DM 자료가 필요하지 않은 업로드인지 여부';

update public.course_instagram_materials
set planning_completed = true,
    updated_at = now()
where nullif(btrim(title), '') is not null
  and not planning_completed;

update public.course_instagram_materials
set planning_completed = true,
    filming_completed = true,
    updated_at = now()
where filming_date is not null
  and (not planning_completed or not filming_completed);

update public.course_instagram_materials
set upload_completed = (
  nullif(btrim(uploaded_url), '') is not null
  and (
    dm_not_required
    or nullif(btrim(dm_material), '') is not null
  )
),
updated_at = now();

alter table public.course_instagram_materials
  drop constraint course_instagram_materials_upload_completion_check;

alter table public.course_instagram_materials
  add constraint course_instagram_materials_upload_completion_check
    check (
      upload_completed = (
        nullif(btrim(uploaded_url), '') is not null
        and (
          dm_not_required
          or nullif(btrim(dm_material), '') is not null
        )
      )
    );

create or replace function public.sync_instagram_upload_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if nullif(btrim(new.title), '') is not null then
    new.planning_completed := true;
  end if;

  if new.filming_date is not null then
    new.planning_completed := true;
    new.filming_completed := true;
  end if;

  new.upload_completed := (
    nullif(btrim(new.uploaded_url), '') is not null
    and (
      new.dm_not_required
      or nullif(btrim(new.dm_material), '') is not null
    )
  );

  if new.upload_completed then
    new.planning_completed := true;
    new.filming_completed := true;
    new.editing_completed := true;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_instagram_upload_completion
  on public.course_instagram_materials;
create trigger sync_instagram_upload_completion
before insert or update of title, filming_date, uploaded_url, dm_material, dm_not_required
on public.course_instagram_materials
for each row
execute function public.sync_instagram_upload_completion();
