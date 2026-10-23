alter table public.course_instagram_notion_snapshots
  drop constraint course_instagram_notion_snapshots_material_fkey,
  drop constraint course_instagram_notion_snapshots_position_check;

alter table public.course_instagram_notion_snapshots
  add constraint course_instagram_notion_snapshots_material_fkey
    foreign key (course_id, position)
    references public.course_instagram_materials(course_id, position)
    on update cascade
    on delete cascade,
  add constraint course_instagram_notion_snapshots_position_check
    check (position between 1 and 500);

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
  current_material_count integer;
  removable_material_count integer;
  materials_to_remove integer;
  current_position smallint;
  compacted_position integer := 0;
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

  perform 1
  from public.courses
  where id = p_course_id
    and workspace_id = p_workspace_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'NOT_FOUND';
  end if;

  perform 1
  from public.course_instagram_materials
  where course_id = p_course_id
  for update;

  select count(*)
  into current_material_count
  from public.course_instagram_materials
  where course_id = p_course_id;

  materials_to_remove := greatest(current_material_count - p_total_count, 0);

  if materials_to_remove > 0 then
    select count(*)
    into removable_material_count
    from public.course_instagram_materials as material
    where material.course_id = p_course_id
      and material.document_id is null
      and nullif(btrim(material.title), '') is null
      and nullif(btrim(material.reference_planning_number), '') is null
      and nullif(btrim(material.notion_url), '') is null
      and not material.planning_completed
      and material.filming_date is null
      and not material.filming_completed
      and not material.editing_completed
      and not material.upload_completed
      and nullif(btrim(material.uploaded_url), '') is null
      and nullif(btrim(material.dm_material), '') is null
      and not exists (
        select 1
        from public.course_instagram_notion_snapshots as snapshot
        where snapshot.course_id = material.course_id
          and snapshot.position = material.position
      );

    if removable_material_count < materials_to_remove then
      raise exception using errcode = '23514', message = 'INSTAGRAM_TOTAL_COUNT_HAS_DATA';
    end if;

    delete from public.course_instagram_materials as material
    where material.course_id = p_course_id
      and material.position in (
        select candidate.position
        from public.course_instagram_materials as candidate
        where candidate.course_id = p_course_id
          and candidate.document_id is null
          and nullif(btrim(candidate.title), '') is null
          and nullif(btrim(candidate.reference_planning_number), '') is null
          and nullif(btrim(candidate.notion_url), '') is null
          and not candidate.planning_completed
          and candidate.filming_date is null
          and not candidate.filming_completed
          and not candidate.editing_completed
          and not candidate.upload_completed
          and nullif(btrim(candidate.uploaded_url), '') is null
          and nullif(btrim(candidate.dm_material), '') is null
          and not exists (
            select 1
            from public.course_instagram_notion_snapshots as snapshot
            where snapshot.course_id = candidate.course_id
              and snapshot.position = candidate.position
          )
        order by candidate.position desc
        limit materials_to_remove
      );

    for current_position in
      select material.position
      from public.course_instagram_materials as material
      where material.course_id = p_course_id
      order by material.position
    loop
      compacted_position := compacted_position + 1;

      if current_position <> compacted_position then
        update public.course_instagram_materials
        set position = compacted_position::smallint,
            updated_at = now()
        where course_id = p_course_id
          and position = current_position;
      end if;
    end loop;
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
