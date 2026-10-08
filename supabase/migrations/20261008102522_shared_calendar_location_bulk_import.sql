alter table public.shared_calendar_events
  add column location_kind text not null default 'tbd',
  add column location_text text not null default '',
  add column time_tbd boolean not null default false,
  add constraint shared_calendar_location_check check (
    location_kind in ('online', 'tbd', 'custom') and location_text = btrim(location_text)
    and char_length(location_text) <= 200
    and ((location_kind = 'custom' and char_length(location_text) > 0)
      or (location_kind <> 'custom' and location_text = ''))
  );
grant update (location_kind, location_text, time_tbd) on public.shared_calendar_events to authenticated;

-- Durable idempotency: a retried request cannot create the same batch twice.
create table public.shared_calendar_imports (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  id uuid not null,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  payload_hash text not null check (char_length(payload_hash) = 32),
  event_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (workspace_id, id)
);
create index shared_calendar_imports_creator_idx on public.shared_calendar_imports(created_by);
alter table public.shared_calendar_imports enable row level security;
revoke all on public.shared_calendar_imports from anon, authenticated;
grant select, insert on public.shared_calendar_imports to authenticated;
grant update (event_ids) on public.shared_calendar_imports to authenticated;
grant all on public.shared_calendar_imports to service_role;
create policy shared_calendar_imports_read on public.shared_calendar_imports for select to authenticated
  using (created_by = (select auth.uid()) and (select calendar_private.has_access(workspace_id)));
create policy shared_calendar_imports_add on public.shared_calendar_imports for insert to authenticated
  with check (created_by = (select auth.uid()) and (select calendar_private.has_access(workspace_id)));
create policy shared_calendar_imports_finish on public.shared_calendar_imports for update to authenticated
  using (created_by = (select auth.uid()) and (select calendar_private.has_access(workspace_id)))
  with check (created_by = (select auth.uid()) and (select calendar_private.has_access(workspace_id)));

-- SECURITY INVOKER preserves existing event/type/import RLS and trigger checks.
-- One RPC is one transaction: any invalid row rolls back types and all events.
create function public.shared_calendar_import(
  p_workspace_id uuid, p_request_id uuid, p_events jsonb, p_create_types boolean default false
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  payload_hash text;
  previous_hash text;
  result_ids uuid[];
  item jsonb;
  type_id uuid;
  type_name text;
  event_id uuid;
begin
  if auth.uid() is null or not calendar_private.has_access(p_workspace_id) then
    raise exception 'Calendar workspace access is required' using errcode = '42501';
  end if;
  if p_request_id is null or p_create_types is null or p_events is null
    or jsonb_typeof(p_events) <> 'array' then
    raise exception 'A request ID and an array of events are required' using errcode = '23514';
  end if;
  if jsonb_array_length(p_events) not between 1 and 100 then
    raise exception 'Import must contain 1 to 100 events' using errcode = '23514';
  end if;
  if p_create_types and not calendar_private.has_access(p_workspace_id, true) then
    raise exception 'Only administrators can add meeting types' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text || p_request_id::text, 0));
  payload_hash := md5(p_events::text || p_create_types::text);
  select i.payload_hash, i.event_ids into previous_hash, result_ids
    from public.shared_calendar_imports i where i.workspace_id = p_workspace_id and i.id = p_request_id;
  if found then
    if previous_hash <> payload_hash then
      raise exception 'The import request was already used with a different payload' using errcode = '40001';
    end if;
    return jsonb_build_object('eventIds', result_ids, 'alreadyImported', true);
  end if;
  insert into public.shared_calendar_imports(workspace_id, id, created_by, payload_hash)
    values (p_workspace_id, p_request_id, auth.uid(), payload_hash);
  result_ids := '{}'::uuid[];
  for item in select value from jsonb_array_elements(p_events) loop
    if jsonb_typeof(item) <> 'object' then
      raise exception 'Every event must be an object' using errcode = '23514';
    end if;
    type_id := nullif(item ->> 'meetingTypeId', '')::uuid;
    if type_id is null then
      if not p_create_types or not calendar_private.has_access(p_workspace_id, true) then
        raise exception 'Only administrators can add missing meeting types' using errcode = '42501';
      end if;
      type_name := btrim(item ->> 'newMeetingTypeName');
      if type_name is null or char_length(type_name) not between 1 and 40 then
        raise exception 'A valid meeting type name is required' using errcode = '23514';
      end if;
      select t.id into type_id from public.shared_calendar_meeting_types t
        where t.workspace_id = p_workspace_id and lower(t.name) = lower(type_name);
      if type_id is null then
        insert into public.shared_calendar_meeting_types(workspace_id, name) values (p_workspace_id, type_name)
          on conflict do nothing returning id into type_id;
        if type_id is null then
          select t.id into type_id from public.shared_calendar_meeting_types t
            where t.workspace_id = p_workspace_id and lower(t.name) = lower(type_name);
        end if;
      end if;
    end if;
    insert into public.shared_calendar_events (
      workspace_id, title, event_date, start_minutes, duration_minutes, meeting_type_id,
      course_id, notes, participant_ids, location_kind, location_text, time_tbd, created_by
    ) values (
      p_workspace_id, item ->> 'title', (item ->> 'eventDate')::date,
      (item ->> 'startMinutes')::integer, (item ->> 'durationMinutes')::integer, type_id,
      nullif(item ->> 'courseId', '')::uuid, coalesce(item ->> 'notes', ''),
      array(select value::uuid from jsonb_array_elements_text(coalesce(item -> 'participantIds', '[]'::jsonb))),
      coalesce(item ->> 'locationKind', 'tbd'), coalesce(item ->> 'locationText', ''),
      coalesce((item ->> 'timeTbd')::boolean, false), auth.uid()
    ) returning id into event_id;
    result_ids := array_append(result_ids, event_id);
  end loop;
  update public.shared_calendar_imports set event_ids = result_ids
    where workspace_id = p_workspace_id and id = p_request_id;
  return jsonb_build_object('eventIds', result_ids, 'alreadyImported', false);
end;
$$;
revoke all on function public.shared_calendar_import(uuid, uuid, jsonb, boolean) from public, anon;
grant execute on function public.shared_calendar_import(uuid, uuid, jsonb, boolean) to authenticated;
