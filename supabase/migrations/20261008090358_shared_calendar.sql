-- Shared schedules are private to workspace members, not public to anonymous visitors.
create schema if not exists calendar_private;
revoke all on schema calendar_private from public, anon;
grant usage on schema calendar_private to authenticated, service_role;

create function calendar_private.has_access(target_workspace uuid, admin_only boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.workspace_members m
    join auth.users u on u.id = m.user_id
    where m.workspace_id = target_workspace and m.user_id = (select auth.uid())
      and coalesce(u.raw_app_meta_data ->> 'account_disabled', 'false') <> 'true'
      and (u.banned_until is null or u.banned_until <= now())
      and (not admin_only or m.role::text in ('admin', 'super_admin')
        or lower(u.email) = 'resumet@gmail.com')
  );
$$;
revoke all on function calendar_private.has_access(uuid, boolean) from public, anon;
grant execute on function calendar_private.has_access(uuid, boolean) to authenticated, service_role;

create table public.shared_calendar_meeting_types (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40),
  code text check (code in ('instructor_zoom', 'rehearsal', 'webinar', 'weekly_meeting')),
  created_at timestamptz not null default now(),
  unique (id, workspace_id),
  unique (workspace_id, code)
);
create unique index shared_calendar_type_name_idx
  on public.shared_calendar_meeting_types(workspace_id, lower(name));

insert into public.shared_calendar_meeting_types(workspace_id, name, code)
select w.id, defaults.name, defaults.code from public.workspaces w
cross join (values ('강사 줌미팅', 'instructor_zoom'), ('리허설', 'rehearsal'),
  ('웨비나', 'webinar'), ('주간회의', 'weekly_meeting')) defaults(name, code);

create table public.shared_calendar_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 120),
  event_date date not null check (event_date between date '2000-01-01' and date '2100-12-31'),
  start_minutes integer not null check (start_minutes between 480 and 1260 and start_minutes % 30 = 0),
  duration_minutes integer not null check (duration_minutes between 30 and 1440 and duration_minutes % 30 = 0),
  meeting_type_id uuid not null,
  course_id uuid references public.courses(id) on delete set null,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version > 0),
  foreign key (meeting_type_id, workspace_id)
    references public.shared_calendar_meeting_types(id, workspace_id)
);
create index shared_calendar_events_workspace_date_idx on public.shared_calendar_events(workspace_id, event_date, start_minutes);
create index shared_calendar_events_course_date_idx on public.shared_calendar_events(course_id, event_date, start_minutes);
create index shared_calendar_events_type_idx on public.shared_calendar_events(meeting_type_id, workspace_id);
create index shared_calendar_events_creator_idx on public.shared_calendar_events(created_by);

create function calendar_private.guard_event()
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
        where t.id = new.meeting_type_id and t.workspace_id = new.workspace_id and t.code = 'instructor_zoom') then
      raise exception 'Only instructor Zoom meetings may link a course in the same workspace' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function calendar_private.guard_event() from public, anon, authenticated;
create trigger shared_calendar_guard_event before insert or update on public.shared_calendar_events
  for each row execute function calendar_private.guard_event();

alter table public.shared_calendar_meeting_types enable row level security;
alter table public.shared_calendar_events enable row level security;
revoke all on public.shared_calendar_meeting_types, public.shared_calendar_events from anon, authenticated;
grant select, insert on public.shared_calendar_meeting_types to authenticated;
grant select, insert, delete on public.shared_calendar_events to authenticated;
grant update (title, event_date, start_minutes, duration_minutes, meeting_type_id, course_id, notes)
  on public.shared_calendar_events to authenticated;
grant all on public.shared_calendar_meeting_types, public.shared_calendar_events to service_role;

create policy shared_calendar_types_read on public.shared_calendar_meeting_types
  for select to authenticated using ((select calendar_private.has_access(workspace_id)));
create policy shared_calendar_types_admin_add on public.shared_calendar_meeting_types
  for insert to authenticated with check (code is null and (select calendar_private.has_access(workspace_id, true)));
create policy shared_calendar_events_read on public.shared_calendar_events
  for select to authenticated using ((select calendar_private.has_access(workspace_id)));
create policy shared_calendar_events_add on public.shared_calendar_events
  for insert to authenticated with check (created_by = (select auth.uid()) and (select calendar_private.has_access(workspace_id)));
create policy shared_calendar_events_edit on public.shared_calendar_events
  for update to authenticated using ((select calendar_private.has_access(workspace_id)))
  with check ((select calendar_private.has_access(workspace_id)));
create policy shared_calendar_events_delete on public.shared_calendar_events
  for delete to authenticated using ((select calendar_private.has_access(workspace_id)));
