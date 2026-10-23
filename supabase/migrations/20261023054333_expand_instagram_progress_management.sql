alter table public.course_document_settings
  add column instagram_account_url text not null default '',
  add column instagram_total_count smallint not null default 0;

alter table public.course_document_settings
  add constraint course_document_settings_instagram_account_url_check
    check (
      instagram_account_url = ''
      or (
        char_length(instagram_account_url) <= 2048
        and instagram_account_url ~* '^https?://'
      )
    ),
  add constraint course_document_settings_instagram_total_count_check
    check (instagram_total_count between 0 and 500);

update public.course_document_settings as settings
set instagram_total_count = material_counts.total_count
from (
  select course_id, greatest(max(position), 0)::smallint as total_count
  from public.course_instagram_materials
  group by course_id
) as material_counts
where settings.course_id = material_counts.course_id;

alter table public.course_instagram_materials
  drop constraint course_instagram_materials_position_check;

alter table public.course_instagram_materials
  add constraint course_instagram_materials_position_check
    check (position between 1 and 500),
  add column planning_completed boolean not null default false,
  add column filming_date date,
  add column filming_completed boolean not null default false,
  add column upload_date date,
  add column upload_completed boolean not null default false,
  add column uploaded_url text not null default '',
  add column dm_material text not null default '';

alter table public.course_instagram_materials
  add constraint course_instagram_materials_uploaded_url_check
    check (
      uploaded_url = ''
      or (
        char_length(uploaded_url) <= 2048
        and uploaded_url ~* '^https?://'
      )
    ),
  add constraint course_instagram_materials_dm_material_check
    check (char_length(dm_material) <= 5000),
  add constraint course_instagram_materials_progress_order_check
    check (
      (not filming_completed or planning_completed)
      and (not upload_completed or filming_completed)
    );

comment on column public.course_document_settings.instagram_account_url is
  '강의별 인스타그램 업로드 계정 링크';
comment on column public.course_document_settings.instagram_total_count is
  '강의별 인스타그램 전체 진행 건수';
comment on column public.course_instagram_materials.uploaded_url is
  '촬영 후 업로드된 인스타그램 콘텐츠 링크';
comment on column public.course_instagram_materials.dm_material is
  '업로드 링크에 연결된 DM 자료 또는 자료 링크';

create or replace function public.resize_instagram_progress(
  p_course_id uuid,
  p_workspace_id uuid,
  p_account_url text,
  p_total_count smallint,
  p_planning_completed_count smallint,
  p_filming_completed_count smallint
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_planning_count integer;
  current_filming_count integer;
  completed_upload_count integer;
begin
  if p_total_count < 0 or p_total_count > 500 then
    raise exception using errcode = '22023', message = 'INSTAGRAM_TOTAL_COUNT_INVALID';
  end if;
  if p_planning_completed_count < 0
    or p_filming_completed_count < 0
    or p_filming_completed_count > p_planning_completed_count
    or p_planning_completed_count > p_total_count then
    raise exception using errcode = '22023', message = 'INSTAGRAM_PROGRESS_COUNT_INVALID';
  end if;
  if p_account_url <> '' and (
    char_length(p_account_url) > 2048
    or p_account_url !~* '^https?://'
  ) then
    raise exception using errcode = '22023', message = 'INSTAGRAM_ACCOUNT_URL_INVALID';
  end if;
  if not exists (
    select 1
    from public.courses
    where id = p_course_id
      and workspace_id = p_workspace_id
  ) then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  perform 1
  from public.course_document_settings
  where course_id = p_course_id
    and workspace_id = p_workspace_id
  for update;

  if exists (
    select 1
    from public.course_instagram_materials
    where course_id = p_course_id
      and position > p_total_count
      and (
        document_id is not null
        or nullif(btrim(title), '') is not null
        or nullif(btrim(reference_planning_number), '') is not null
        or planning_completed
        or filming_date is not null
        or filming_completed
        or upload_date is not null
        or upload_completed
        or nullif(btrim(uploaded_url), '') is not null
        or nullif(btrim(dm_material), '') is not null
      )
  ) then
    raise exception using errcode = '23514', message = 'INSTAGRAM_TOTAL_COUNT_HAS_DATA';
  end if;

  insert into public.course_document_settings (
    course_id,
    workspace_id,
    instagram_account_url,
    instagram_total_count
  )
  values (
    p_course_id,
    p_workspace_id,
    btrim(p_account_url),
    p_total_count
  )
  on conflict (course_id) do update
  set instagram_account_url = excluded.instagram_account_url,
      instagram_total_count = excluded.instagram_total_count,
      updated_at = now();

  insert into public.course_instagram_materials (course_id, position)
  select p_course_id, generated.position::smallint
  from generate_series(1, p_total_count::integer) as generated(position)
  on conflict (course_id, position) do nothing;

  delete from public.course_instagram_materials
  where course_id = p_course_id
    and position > p_total_count;

  select
    count(*) filter (where planning_completed),
    count(*) filter (where filming_completed),
    count(*) filter (where upload_completed)
  into current_planning_count, current_filming_count, completed_upload_count
  from public.course_instagram_materials
  where course_id = p_course_id;

  if p_filming_completed_count < completed_upload_count then
    raise exception using errcode = '22023', message = 'INSTAGRAM_FILMING_COUNT_BELOW_UPLOADS';
  end if;

  if current_filming_count <> p_filming_completed_count then
    with candidates as (
      select position
      from public.course_instagram_materials
      where course_id = p_course_id
        and not upload_completed
      order by filming_completed desc, position
      limit greatest(p_filming_completed_count - completed_upload_count, 0)
    )
    update public.course_instagram_materials as material
    set filming_completed = material.upload_completed or material.position in (select position from candidates),
        planning_completed = material.planning_completed or material.upload_completed or material.position in (select position from candidates),
        updated_at = now()
    where material.course_id = p_course_id;
  end if;

  if current_planning_count <> p_planning_completed_count
    or current_filming_count <> p_filming_completed_count then
    with required as (
      select position
      from public.course_instagram_materials
      where course_id = p_course_id
        and filming_completed
    ), candidates as (
      select position
      from public.course_instagram_materials
      where course_id = p_course_id
        and not filming_completed
      order by planning_completed desc, position
      limit greatest(
        p_planning_completed_count - (
          select count(*) from required
        ),
        0
      )
    )
    update public.course_instagram_materials as material
    set planning_completed = material.filming_completed or material.position in (select position from candidates),
        updated_at = now()
    where material.course_id = p_course_id;
  end if;
end;
$$;

revoke all on function public.resize_instagram_progress(uuid, uuid, text, smallint, smallint, smallint)
  from public, anon, authenticated;
grant execute on function public.resize_instagram_progress(uuid, uuid, text, smallint, smallint, smallint)
  to service_role;

create or replace function public.start_instagram_material_document(
  p_course_id uuid,
  p_position smallint,
  p_slug text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  material_title text;
  linked_document_id uuid;
  target_workspace_id uuid;
  target_instructor_name text;
  new_document_id uuid;
begin
  if p_position < 1 or p_position > 500 then
    raise exception using errcode = '22023', message = '인스타 자료 번호를 확인해 주세요.';
  end if;

  select course.workspace_id, course.instructor_name
  into target_workspace_id, target_instructor_name
  from public.courses as course
  where course.id = p_course_id;

  if not found then
    raise exception using errcode = 'P0002', message = '강의를 찾을 수 없습니다.';
  end if;

  select material.title, material.document_id
  into material_title, linked_document_id
  from public.course_instagram_materials as material
  where material.course_id = p_course_id
    and material.position = p_position
  for update;

  if not found or nullif(btrim(material_title), '') is null then
    raise exception using errcode = 'P0002', message = '작성할 인스타 자료 제목이 없습니다.';
  end if;

  if linked_document_id is not null and exists (
    select 1
    from public.course_documents as document
    where document.id = linked_document_id
      and document.course_id = p_course_id
      and document.deleted_at is null
  ) then
    return linked_document_id;
  end if;

  if linked_document_id is not null then
    update public.course_instagram_materials
    set document_id = null,
        updated_at = now()
    where course_id = p_course_id
      and position = p_position;
  end if;

  insert into public.course_documents (
    workspace_id,
    course_id,
    instructor_name,
    title,
    slug,
    content
  )
  values (
    target_workspace_id,
    p_course_id,
    coalesce(target_instructor_name, ''),
    btrim(material_title),
    p_slug,
    '[]'::jsonb
  )
  returning id into new_document_id;

  update public.course_instagram_materials
  set document_id = new_document_id,
      updated_at = now()
  where course_id = p_course_id
    and position = p_position;

  return new_document_id;
end;
$$;

revoke all on function public.start_instagram_material_document(uuid, smallint, text)
  from public, anon, authenticated;
grant execute on function public.start_instagram_material_document(uuid, smallint, text)
  to service_role;
