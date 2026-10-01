-- Preserve existing data while changing Instagram materials to a fixed
-- one-material-to-one-document workflow.

update public.course_instagram_materials as material
set title = document.title,
    updated_at = now()
from public.course_documents as document
where material.course_id = document.course_id
  and material.document_id = document.id
  and nullif(btrim(material.title), '') is null;

-- Prefer matching legacy documents to an unassigned material with the same title.
with unlinked_documents as (
  select
    document.id,
    document.course_id,
    btrim(document.title) as title,
    row_number() over (
      partition by document.course_id, btrim(document.title)
      order by document.created_at, document.id
    ) as match_order
  from public.course_documents as document
  where document.deleted_at is null
    and not exists (
      select 1
      from public.course_instagram_materials as linked
      where linked.course_id = document.course_id
        and linked.document_id = document.id
    )
), matching_materials as (
  select
    material.course_id,
    material.position,
    btrim(material.title) as title,
    row_number() over (
      partition by material.course_id, btrim(material.title)
      order by material.position
    ) as match_order
  from public.course_instagram_materials as material
  where material.document_id is null
    and nullif(btrim(material.title), '') is not null
), matches as (
  select
    material.course_id,
    material.position,
    document.id as document_id
  from matching_materials as material
  join unlinked_documents as document
    on document.course_id = material.course_id
   and document.title = material.title
   and document.match_order = material.match_order
)
update public.course_instagram_materials as material
set document_id = matches.document_id,
    updated_at = now()
from matches
where material.course_id = matches.course_id
  and material.position = matches.position;

-- Put any remaining legacy documents in the first empty slots so no writing is lost.
with remaining_documents as (
  select
    document.id,
    document.course_id,
    document.title,
    row_number() over (
      partition by document.course_id
      order by document.created_at, document.id
    ) as slot_order
  from public.course_documents as document
  where document.deleted_at is null
    and not exists (
      select 1
      from public.course_instagram_materials as linked
      where linked.course_id = document.course_id
        and linked.document_id = document.id
    )
), available_slots as (
  select
    course.id as course_id,
    generated.position,
    row_number() over (
      partition by course.id
      order by generated.position
    ) as slot_order
  from (
    select distinct course_id as id
    from remaining_documents
  ) as course
  cross join generate_series(1, 40) as generated(position)
  left join public.course_instagram_materials as material
    on material.course_id = course.id
   and material.position = generated.position
  where material.document_id is null
    and nullif(btrim(material.title), '') is null
)
insert into public.course_instagram_materials (
  course_id,
  position,
  title,
  document_id
)
select
  document.course_id,
  slot.position,
  document.title,
  document.id
from remaining_documents as document
join available_slots as slot
  on slot.course_id = document.course_id
 and slot.slot_order = document.slot_order
on conflict (course_id, position) do update
set title = excluded.title,
    document_id = excluded.document_id,
    updated_at = now()
where public.course_instagram_materials.document_id is null
  and nullif(btrim(public.course_instagram_materials.title), '') is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'course_instagram_materials_linked_title_check'
      and conrelid = 'public.course_instagram_materials'::regclass
  ) then
    alter table public.course_instagram_materials
      add constraint course_instagram_materials_linked_title_check
      check (
        document_id is null
        or char_length(btrim(title)) between 1 and 200
      );
  end if;
end
$$;

create or replace function public.sync_instagram_material_document_title()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.document_id is not null then
    update public.course_documents
    set title = new.title
    where id = new.document_id
      and course_id = new.course_id
      and deleted_at is null
      and title is distinct from new.title;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_instagram_material_document_title
  on public.course_instagram_materials;
create trigger sync_instagram_material_document_title
after insert or update of title, document_id
on public.course_instagram_materials
for each row
when (new.document_id is not null)
execute function public.sync_instagram_material_document_title();

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
  if p_position < 1 or p_position > 40 then
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

revoke all on function public.sync_instagram_material_document_title()
  from public, anon, authenticated;
grant execute on function public.sync_instagram_material_document_title()
  to service_role;

revoke all on function public.start_instagram_material_document(uuid, smallint, text)
  from public, anon, authenticated;
grant execute on function public.start_instagram_material_document(uuid, smallint, text)
  to service_role;

comment on function public.start_instagram_material_document(uuid, smallint, text) is
  '고정 인스타 자료 제목에 대응하는 강사 문서를 원자적으로 생성하거나 기존 문서를 반환한다.';
