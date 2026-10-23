alter table public.course_instagram_materials
  add column editing_completed boolean not null default false;

update public.course_instagram_materials
set editing_completed = upload_completed
where upload_completed;

update public.course_instagram_materials
set upload_completed = (
  nullif(btrim(uploaded_url), '') is not null
  and nullif(btrim(dm_material), '') is not null
);

update public.course_instagram_materials
set planning_completed = true,
    filming_completed = true,
    editing_completed = true
where upload_completed;

alter table public.course_instagram_materials
  drop constraint course_instagram_materials_progress_order_check;

alter table public.course_instagram_materials
  add constraint course_instagram_materials_progress_order_check
    check (
      (not filming_completed or planning_completed)
      and (not upload_completed or filming_completed)
      and (not upload_completed or editing_completed)
    ),
  add constraint course_instagram_materials_upload_completion_check
    check (
      upload_completed = (
        nullif(btrim(uploaded_url), '') is not null
        and nullif(btrim(dm_material), '') is not null
      )
    );

comment on column public.course_instagram_materials.editing_completed is
  '인스타그램 콘텐츠 편집 완료 여부';

create or replace function public.sync_instagram_upload_completion()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.upload_completed := (
    nullif(btrim(new.uploaded_url), '') is not null
    and nullif(btrim(new.dm_material), '') is not null
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
before insert or update of uploaded_url, dm_material
on public.course_instagram_materials
for each row
execute function public.sync_instagram_upload_completion();

create or replace function public.instagram_upload_date(
  p_webinar_at timestamptz,
  p_position smallint,
  p_total_count smallint
)
returns date
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  result_date date;
  remaining_weekdays integer;
begin
  if p_webinar_at is null
    or p_position < 1
    or p_total_count < 1
    or p_position > p_total_count then
    return null;
  end if;

  result_date := (p_webinar_at at time zone 'Asia/Seoul')::date;
  remaining_weekdays := p_total_count - p_position;

  while remaining_weekdays > 0 loop
    result_date := result_date - 1;
    if extract(isodow from result_date) between 1 and 5 then
      remaining_weekdays := remaining_weekdays - 1;
    end if;
  end loop;

  return result_date;
end;
$$;

create or replace function public.refresh_instagram_upload_schedule(
  p_course_id uuid
)
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.course_instagram_materials as material
  set upload_date = public.instagram_upload_date(
        course.free_webinar_at,
        material.position,
        settings.instagram_total_count
      ),
      updated_at = now()
  from public.courses as course
  join public.course_document_settings as settings
    on settings.course_id = course.id
  where material.course_id = p_course_id
    and course.id = material.course_id
    and material.upload_date is distinct from public.instagram_upload_date(
      course.free_webinar_at,
      material.position,
      settings.instagram_total_count
    );
$$;

create or replace function public.sync_instagram_upload_schedule_from_course()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  perform public.refresh_instagram_upload_schedule(new.id);
  return new;
end;
$$;

drop trigger if exists sync_instagram_upload_schedule_from_course
  on public.courses;
create trigger sync_instagram_upload_schedule_from_course
after update of free_webinar_at
on public.courses
for each row
when (old.free_webinar_at is distinct from new.free_webinar_at)
execute function public.sync_instagram_upload_schedule_from_course();

do $$
declare
  target_course_id uuid;
begin
  for target_course_id in
    select distinct course_id
    from public.course_instagram_materials
  loop
    perform public.refresh_instagram_upload_schedule(target_course_id);
  end loop;
end
$$;

revoke all on function public.sync_instagram_upload_completion()
  from public, anon, authenticated;
revoke all on function public.instagram_upload_date(timestamptz, smallint, smallint)
  from public, anon, authenticated;
revoke all on function public.refresh_instagram_upload_schedule(uuid)
  from public, anon, authenticated;
revoke all on function public.sync_instagram_upload_schedule_from_course()
  from public, anon, authenticated;

grant execute on function public.refresh_instagram_upload_schedule(uuid)
  to service_role;
grant execute on function public.instagram_upload_date(timestamptz, smallint, smallint)
  to service_role;
