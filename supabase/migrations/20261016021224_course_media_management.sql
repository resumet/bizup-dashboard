-- Empty auto-created settings must not prevent deleting a course.
alter table public.course_document_settings drop constraint course_document_settings_course_id_fkey;
alter table public.course_document_settings add constraint course_document_settings_course_id_fkey foreign key(course_id) references public.courses(id) on delete cascade;
-- Per-course media workspaces are provisioned atomically with every course.
create table public.course_youtube_settings (
  course_id uuid primary key references public.courses(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id),
  public_enabled boolean not null default false,
  public_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex') check (public_token ~ '^[a-f0-9]{48}$'),
  brief_enabled boolean not null default false,
  brief_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex') check (brief_token ~ '^[a-f0-9]{48}$'),
  brief jsonb not null default '{}'::jsonb check (jsonb_typeof(brief) = 'object' and octet_length(brief::text) <= 150000),
  brief_revision integer not null default 0,
  notion_page_id uuid,
  notion_url text not null default '',
  notion_public_url text not null default '',
  notion_synced_revision integer,
  notion_sync_started_at timestamptz,
  updated_at timestamptz not null default now()
);
alter table public.course_youtube_settings enable row level security;
revoke all on public.course_youtube_settings from public, anon, authenticated;
grant all on public.course_youtube_settings to service_role;
create index course_youtube_settings_workspace_idx on public.course_youtube_settings(workspace_id);

create table public.workspace_notion_media_connections (
  workspace_id uuid primary key references public.workspaces(id),
  token_ciphertext text not null,
  parent_id uuid not null,
  parent_kind text not null default 'data_source' check (parent_kind in ('data_source','page')),
  title_property text not null default '강사명',
  updated_at timestamptz not null default now()
);
alter table public.workspace_notion_media_connections enable row level security;
revoke all on public.workspace_notion_media_connections from public, anon, authenticated;
grant all on public.workspace_notion_media_connections to service_role;

alter table public.course_youtube_appearances
  add column request_status text not null default 'planned' check (request_status in ('planned','requested','confirmed','declined')),
  add column filming_at timestamptz,
  add column filming_confirmed boolean not null default false,
  add column note text not null default '' check (length(note) <= 5000),
  add column respondent text not null default '' check (length(respondent) <= 100),
  add column revision integer not null default 0,
  add column updated_at timestamptz not null default now(),
  add constraint youtube_confirmed_filming_requires_date check (not filming_confirmed or filming_at is not null);

create schema if not exists course_media_private;
revoke all on schema course_media_private from public, anon, authenticated;
-- A trigger must provision protected settings even when a permitted course insert uses authenticated.
-- It can only copy NEW.id / NEW.workspace_id and cannot grant public access or accept caller parameters.
create function course_media_private.provision_course_media() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.course_document_settings(course_id,workspace_id) values(new.id,new.workspace_id) on conflict(course_id) do nothing;
  insert into public.course_youtube_settings(course_id,workspace_id) values(new.id,new.workspace_id) on conflict(course_id) do nothing;
  return new;
end;
$$;
revoke all on function course_media_private.provision_course_media() from public, anon, authenticated;
create trigger provision_course_media after insert on public.courses for each row execute function course_media_private.provision_course_media();
insert into public.course_document_settings(course_id,workspace_id) select id,workspace_id from public.courses on conflict(course_id) do nothing;
insert into public.course_youtube_settings(course_id,workspace_id) select id,workspace_id from public.courses on conflict(course_id) do nothing;

-- Lock the share setting while writing so disabling/regenerating access takes effect atomically.
create function public.update_public_youtube_media(p_token text,p_kind text,p_payload jsonb) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare settings public.course_youtube_settings; result jsonb;
begin
  if p_token !~ '^[a-f0-9]{48}$' or p_kind not in ('brief','schedule') then raise exception 'NOT_FOUND'; end if;
  if p_kind = 'brief' then
    select * into settings from public.course_youtube_settings where brief_token=p_token for update;
    if not found or not settings.brief_enabled then raise exception 'NOT_FOUND'; end if;
    if settings.brief_revision <> (p_payload->>'revision')::integer then raise exception 'CONFLICT'; end if;
    update public.course_youtube_settings set brief=p_payload->'brief',brief_revision=brief_revision+1,updated_at=now()
      where course_id=settings.course_id returning jsonb_build_object('brief',brief,'revision',brief_revision) into result;
  else
    select * into settings from public.course_youtube_settings where public_token=p_token for update;
    if not found or not settings.public_enabled then raise exception 'NOT_FOUND'; end if;
    update public.course_youtube_appearances set
      request_status=p_payload->>'request_status',filming_at=nullif(p_payload->>'filming_at','')::timestamptz,
      filming_confirmed=(p_payload->>'filming_confirmed')::boolean,note=p_payload->>'note',respondent=p_payload->>'respondent',revision=revision+1,updated_at=now()
      where id=(p_payload->>'id')::uuid and course_id=settings.course_id and revision=(p_payload->>'revision')::integer
      returning jsonb_build_object('id',id,'revision',revision,'request_status',request_status,'filming_at',filming_at,'filming_confirmed',filming_confirmed,'note',note,'respondent',respondent) into result;
    if result is null then raise exception 'CONFLICT'; end if;
  end if;
  return result;
end;
$$;
revoke all on function public.update_public_youtube_media(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.update_public_youtube_media(text,text,jsonb) to service_role;
