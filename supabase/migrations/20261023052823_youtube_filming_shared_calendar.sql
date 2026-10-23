-- Keep confirmed YouTube filming dates in the shared calendar.
alter table public.shared_calendar_meeting_types
  drop constraint shared_calendar_meeting_types_code_check,
  add constraint shared_calendar_meeting_types_code_check
    check (code in ('instructor_zoom', 'rehearsal', 'webinar', 'weekly_meeting', 'youtube_filming'));

insert into public.shared_calendar_meeting_types(workspace_id, name, code)
select id, '유튜브 촬영', 'youtube_filming'
from public.workspaces
on conflict (workspace_id, code) do nothing;

alter table public.shared_calendar_events
  add column youtube_appearance_id uuid
    references public.course_youtube_appearances(id) on delete cascade,
  add constraint shared_calendar_youtube_appearance_unique unique (youtube_appearance_id);

comment on column public.shared_calendar_events.youtube_appearance_id is
  'YouTube appearance that automatically owns this shared-calendar event.';

create or replace function calendar_private.guard_event()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if new.workspace_id is distinct from old.workspace_id then
      raise exception 'Calendar workspace cannot be changed' using errcode = '23514';
    end if;
    new.created_at := old.created_at;
    new.version := old.version + 1;
  else
    new.version := 1;
  end if;
  new.updated_at := clock_timestamp();
  if new.course_id is not null then
    if not exists (select 1 from public.courses c where c.id = new.course_id and c.workspace_id = new.workspace_id)
      or not exists (select 1 from public.shared_calendar_meeting_types t
        where t.id = new.meeting_type_id and t.workspace_id = new.workspace_id
          and t.code in ('instructor_zoom', 'youtube_filming')) then
      raise exception 'Only instructor Zoom meetings or YouTube filming may link a course in the same workspace' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

create or replace function course_media_private.sync_youtube_filming_calendar_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  course_row record;
  filming_type_id uuid;
  event_title text;
begin
  if tg_op = 'DELETE' then
    delete from public.shared_calendar_events
    where youtube_appearance_id = old.id;
    return old;
  end if;

  if new.request_status <> 'confirmed'
    or not new.filming_confirmed
    or new.filming_date is null then
    delete from public.shared_calendar_events
    where youtube_appearance_id = new.id;
    return new;
  end if;

  select c.workspace_id, c.instructor_name
  into course_row
  from public.courses c
  where c.id = new.course_id;

  if not found then
    delete from public.shared_calendar_events
    where youtube_appearance_id = new.id;
    return new;
  end if;

  select t.id
  into filming_type_id
  from public.shared_calendar_meeting_types t
  where t.workspace_id = course_row.workspace_id
    and t.code = 'youtube_filming';

  if filming_type_id is null then
    raise exception 'YouTube filming calendar type is missing for workspace %', course_row.workspace_id
      using errcode = '23514';
  end if;

  event_title := left(
    concat_ws('-', nullif(btrim(course_row.instructor_name), ''), nullif(btrim(new.channel_name), '')),
    117
  ) || '-촬영';

  insert into public.shared_calendar_events (
    workspace_id, title, event_date, start_minutes, duration_minutes,
    meeting_type_id, course_id, notes, participant_ids,
    location_kind, location_text, time_tbd, created_by, youtube_appearance_id
  ) values (
    course_row.workspace_id, event_title, new.filming_date, 540, 60,
    filming_type_id, new.course_id, '', '{}'::uuid[],
    'tbd', '', true, null, new.id
  )
  on conflict (youtube_appearance_id) do update set
    title = excluded.title,
    event_date = excluded.event_date,
    meeting_type_id = excluded.meeting_type_id,
    course_id = excluded.course_id,
    time_tbd = true;

  return new;
end;
$$;

revoke all on function course_media_private.sync_youtube_filming_calendar_event()
from public, anon, authenticated;

create trigger sync_youtube_filming_calendar_event
after insert or update of course_id, channel_name, request_status, filming_confirmed, filming_date
or delete on public.course_youtube_appearances
for each row execute function course_media_private.sync_youtube_filming_calendar_event();

create or replace function course_media_private.sync_youtube_filming_calendar_instructor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.shared_calendar_events e
  set title = left(
    concat_ws('-', nullif(btrim(new.instructor_name), ''), nullif(btrim(a.channel_name), '')),
    117
  ) || '-촬영'
  from public.course_youtube_appearances a
  where a.course_id = new.id
    and e.youtube_appearance_id = a.id;
  return new;
end;
$$;

revoke all on function course_media_private.sync_youtube_filming_calendar_instructor()
from public, anon, authenticated;

create trigger sync_youtube_filming_calendar_instructor
after update of instructor_name on public.courses
for each row
when (new.instructor_name is distinct from old.instructor_name)
execute function course_media_private.sync_youtube_filming_calendar_instructor();

insert into public.shared_calendar_events (
  workspace_id, title, event_date, start_minutes, duration_minutes,
  meeting_type_id, course_id, notes, participant_ids,
  location_kind, location_text, time_tbd, created_by, youtube_appearance_id
)
select
  c.workspace_id,
  left(concat_ws('-', nullif(btrim(c.instructor_name), ''), nullif(btrim(a.channel_name), '')), 117) || '-촬영',
  a.filming_date,
  540,
  60,
  t.id,
  c.id,
  '',
  '{}'::uuid[],
  'tbd',
  '',
  true,
  null,
  a.id
from public.course_youtube_appearances a
join public.courses c on c.id = a.course_id
join public.shared_calendar_meeting_types t
  on t.workspace_id = c.workspace_id and t.code = 'youtube_filming'
where a.request_status = 'confirmed'
  and a.filming_confirmed
  and a.filming_date is not null
on conflict (youtube_appearance_id) do update set
  title = excluded.title,
  event_date = excluded.event_date,
  meeting_type_id = excluded.meeting_type_id,
  course_id = excluded.course_id,
  time_tbd = true;

notify pgrst, 'reload schema';
