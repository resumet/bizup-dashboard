-- The analyzer is a cumulative channel registry. Legacy run/snapshot tables are
-- retained only so existing data can be migrated without loss.
create table public.youtube_analyzed_channels (
  workspace_id uuid not null references public.workspaces(id),
  position bigint generated always as identity,
  channel_id text not null,
  channel jsonb not null,
  metrics jsonb not null,
  warnings jsonb not null default '[]',
  first_analyzed_at timestamptz not null,
  last_analysis_started_at timestamptz not null,
  last_analyzed_at timestamptz not null default now(),
  primary key(workspace_id, channel_id)
);

create table public.youtube_channel_videos (
  workspace_id uuid not null,
  channel_id text not null,
  video_id text not null,
  published_at timestamptz not null,
  data jsonb not null,
  primary key(workspace_id, channel_id, video_id),
  foreign key(workspace_id, channel_id)
    references public.youtube_analyzed_channels(workspace_id, channel_id)
    on delete cascade
);

create index on public.youtube_analyzed_channels(workspace_id, position);
create index on public.youtube_channel_videos(workspace_id, channel_id, published_at desc, video_id);

-- Preserve existing installations by seeding one current row per channel from
-- the most recently completed legacy run.
with ranked as (
  select
    b.workspace_id,
    r.channel_id,
    r.channel,
    r.metrics,
    r.warnings,
    min(r.completed_at) over (partition by b.workspace_id, r.channel_id) as first_analyzed_at,
    r.started_at as last_analysis_started_at,
    r.completed_at as last_analyzed_at,
    row_number() over (
      partition by b.workspace_id, r.channel_id
      order by r.completed_at desc, r.id desc
    ) as position
  from public.youtube_analysis_runs r
  join public.youtube_analysis_batches b on b.id = r.batch_id
)
insert into public.youtube_analyzed_channels(
  workspace_id,
  channel_id,
  channel,
  metrics,
  warnings,
  first_analyzed_at,
  last_analysis_started_at,
  last_analyzed_at
)
select
  workspace_id,
  channel_id,
  channel,
  metrics,
  warnings,
  first_analyzed_at,
  last_analysis_started_at,
  last_analyzed_at
from ranked
where position = 1
order by first_analyzed_at, channel_id;

with latest_runs as (
  select
    b.workspace_id,
    r.channel_id,
    r.id as run_id,
    row_number() over (
      partition by b.workspace_id, r.channel_id
      order by r.completed_at desc, r.id desc
    ) as position
  from public.youtube_analysis_runs r
  join public.youtube_analysis_batches b on b.id = r.batch_id
)
insert into public.youtube_channel_videos(workspace_id, channel_id, video_id, published_at, data)
select l.workspace_id, l.channel_id, v.video_id, v.published_at, v.data
from latest_runs l
join public.youtube_video_snapshots v on v.run_id = l.run_id
where l.position = 1;

alter table public.youtube_analyzed_channels enable row level security;
alter table public.youtube_channel_videos enable row level security;

create policy youtube_analyzed_channels_read on public.youtube_analyzed_channels
for select to authenticated using (
  exists(
    select 1
    from public.workspace_members m
    where m.workspace_id = youtube_analyzed_channels.workspace_id
      and m.user_id = auth.uid()
  )
);

create policy youtube_channel_videos_read on public.youtube_channel_videos
for select to authenticated using (
  exists(
    select 1
    from public.workspace_members m
    where m.workspace_id = youtube_channel_videos.workspace_id
      and m.user_id = auth.uid()
  )
);

revoke all on public.youtube_analyzed_channels, public.youtube_channel_videos from anon, authenticated;
grant select on public.youtube_analyzed_channels, public.youtube_channel_videos to authenticated;
grant all on public.youtube_analyzed_channels, public.youtube_channel_videos to service_role;

-- Save one current state per channel. A repeated channel updates only that
-- channel and replaces only its current video collection. Older overlapping
-- jobs cannot overwrite a newer collection that started later.
create function public.save_youtube_channel(
  p_batch uuid,
  p_channel jsonb,
  p_metrics jsonb,
  p_warnings jsonb,
  p_started timestamptz,
  p_videos jsonb
)
returns text language plpgsql security definer set search_path = public as $$
declare
  v_workspace_id uuid;
  v_channel_id text := p_channel->>'id';
  v_saved_channel_id text;
begin
  select workspace_id into v_workspace_id
  from public.youtube_analysis_batches
  where id = p_batch
  for update;

  if not found then
    raise exception 'Batch not found';
  end if;
  if v_channel_id is null or v_channel_id = '' then
    raise exception 'Channel id is required';
  end if;

  insert into public.youtube_analyzed_channels(
    workspace_id,
    channel_id,
    channel,
    metrics,
    warnings,
    first_analyzed_at,
    last_analysis_started_at,
    last_analyzed_at
  )
  values(
    v_workspace_id,
    v_channel_id,
    p_channel,
    p_metrics,
    p_warnings,
    p_started,
    p_started,
    now()
  )
  on conflict(workspace_id, channel_id) do update set
    channel = excluded.channel,
    metrics = excluded.metrics,
    warnings = excluded.warnings,
    last_analysis_started_at = excluded.last_analysis_started_at,
    last_analyzed_at = excluded.last_analyzed_at
  where excluded.last_analysis_started_at >= youtube_analyzed_channels.last_analysis_started_at
  returning channel_id into v_saved_channel_id;

  if v_saved_channel_id is not null then
    delete from public.youtube_channel_videos
    where workspace_id = v_workspace_id and channel_id = v_channel_id;

    insert into public.youtube_channel_videos(workspace_id, channel_id, video_id, published_at, data)
    select v_workspace_id, v_channel_id, v->>'id', (v->>'publishedAt')::timestamptz, v
    from jsonb_array_elements(p_videos) v;
  end if;

  update public.youtube_analysis_requests
  set status = 'completed', error_code = null
  where batch_id = p_batch and resolved_channel_id = v_channel_id;

  return v_channel_id;
end;
$$;

revoke all on function public.save_youtube_channel(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_youtube_channel(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb) to service_role;

-- Stop all application roles from creating new legacy snapshots. The tables
-- remain intact as a non-operational archive after the backfill above.
revoke execute on function public.save_youtube_analysis(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb) from service_role;

comment on table public.youtube_analysis_runs is 'Legacy archive; replaced by youtube_analyzed_channels.';
comment on table public.youtube_video_snapshots is 'Legacy archive; replaced by youtube_channel_videos.';

notify pgrst, 'reload schema';
