-- One event row stores participants atomically with the existing version guard.
-- Empty selection is valid and existing events retain an empty selection.
alter table public.shared_calendar_events
  add column participant_ids uuid[] not null default '{}'::uuid[];

grant update (participant_ids) on public.shared_calendar_events to authenticated;

-- Private trigger needs Auth access to validate newly selected participants.
-- It is not exposed as an RPC and has no executable grants for API roles.
create function calendar_private.guard_participants()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_ids uuid[] := '{}'::uuid[];
begin
  if auth.uid() is not null and not calendar_private.has_access(new.workspace_id) then
    raise exception 'Calendar workspace access is required' using errcode = '42501';
  end if;
  if cardinality(new.participant_ids) > 500
    or coalesce(array_ndims(new.participant_ids), 1) <> 1
    or exists (select 1 from unnest(new.participant_ids) as p(id) where p.id is null)
    or cardinality(new.participant_ids) <> (select count(distinct p.id) from unnest(new.participant_ids) as p(id)) then
    raise exception 'Participants must be distinct user IDs, at most 500' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' then previous_ids := old.participant_ids; end if;
  -- Preserve historical selections if an account is later disabled/deleted or
  -- leaves the workspace; retaining them must not block a date/title edit.
  if exists (
    select 1 from unnest(new.participant_ids) as p(id)
    where not (p.id = any(previous_ids)) and not exists (
      select 1 from public.workspace_members as m
      join auth.users as u on u.id = m.user_id
      where m.workspace_id = new.workspace_id and m.user_id = p.id
        and u.email_confirmed_at is not null
        and coalesce(u.raw_app_meta_data ->> 'account_disabled', 'false') <> 'true'
        and (u.banned_until is null or u.banned_until <= now())
    )
  ) then
    raise exception 'New participants must be active members of the same workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function calendar_private.guard_participants() from public, anon, authenticated;
create trigger shared_calendar_participants_guard
before insert or update of participant_ids on public.shared_calendar_events
for each row execute function calendar_private.guard_participants();
