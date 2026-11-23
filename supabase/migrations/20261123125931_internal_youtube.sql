create table public.internal_youtube_channels (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 200),
  manager_name text not null default '',
  channel_url text not null default '',
  revision integer not null default 1,
  unique (id, workspace_id)
);
create unique index if not exists courses_internal_youtube_workspace_key on public.courses(id, workspace_id);
create table public.internal_youtube_appearances (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid not null,
  channel_id uuid not null,
  filming_date date,
  location text not null default '',
  original_drive_url text not null default '',
  edited_drive_url text not null default '',
  upload_date date,
  published_url text not null default '',
  revision integer not null default 1,
  foreign key(course_id, workspace_id) references public.courses(id, workspace_id) on delete cascade,
  foreign key(channel_id, workspace_id) references public.internal_youtube_channels(id, workspace_id) on delete restrict
);
create index internal_youtube_appearances_course_idx on public.internal_youtube_appearances(workspace_id, course_id);
create index internal_youtube_appearances_channel_idx on public.internal_youtube_appearances(channel_id, workspace_id);
alter table public.internal_youtube_channels enable row level security;
alter table public.internal_youtube_appearances enable row level security;
revoke all on public.internal_youtube_channels, public.internal_youtube_appearances from public, anon, authenticated;
grant select, insert, update, delete on public.internal_youtube_channels, public.internal_youtube_appearances to service_role;
