create table public.youtube_analysis_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  created_by uuid not null references auth.users(id),
  status text not null default 'pending',
  input_count integer not null,
  unique_channel_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.youtube_analysis_requests (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.youtube_analysis_batches(id),
  input_order integer not null,
  input_url text not null,
  status text not null default 'pending',
  resolved_channel_id text,
  error_code text,
  unique(batch_id, input_order)
);
create table public.youtube_analysis_runs (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.youtube_analysis_batches(id),
  channel_id text not null,
  channel jsonb not null,
  metrics jsonb not null,
  warnings jsonb not null default '[]',
  started_at timestamptz not null,
  completed_at timestamptz not null default now(),
  unique(batch_id, channel_id)
);
create table public.youtube_video_snapshots (
  run_id uuid not null references public.youtube_analysis_runs(id),
  video_id text not null,
  published_at timestamptz not null,
  data jsonb not null,
  primary key(run_id, video_id)
);
create index on public.youtube_analysis_batches(workspace_id, created_at desc);
create index on public.youtube_analysis_runs(channel_id, completed_at desc);
create index on public.youtube_video_snapshots(run_id, published_at desc, video_id);

alter table public.youtube_analysis_batches enable row level security;
alter table public.youtube_analysis_requests enable row level security;
alter table public.youtube_analysis_runs enable row level security;
alter table public.youtube_video_snapshots enable row level security;
create policy youtube_batches_read on public.youtube_analysis_batches for select to authenticated using (
  exists(select 1 from public.workspace_members m where m.workspace_id = youtube_analysis_batches.workspace_id and m.user_id = auth.uid())
);
create policy youtube_requests_read on public.youtube_analysis_requests for select to authenticated using (
  exists(select 1 from public.youtube_analysis_batches b where b.id = youtube_analysis_requests.batch_id)
);
create policy youtube_runs_read on public.youtube_analysis_runs for select to authenticated using (
  exists(select 1 from public.youtube_analysis_batches b where b.id = youtube_analysis_runs.batch_id)
);
create policy youtube_videos_read on public.youtube_video_snapshots for select to authenticated using (
  exists(select 1 from public.youtube_analysis_runs r where r.id = youtube_video_snapshots.run_id)
);
revoke all on public.youtube_analysis_batches, public.youtube_analysis_requests, public.youtube_analysis_runs, public.youtube_video_snapshots from anon, authenticated;
grant select on public.youtube_analysis_batches, public.youtube_analysis_requests, public.youtube_analysis_runs, public.youtube_video_snapshots to authenticated;
grant all on public.youtube_analysis_batches, public.youtube_analysis_requests, public.youtube_analysis_runs, public.youtube_video_snapshots to service_role;

create function public.youtube_snapshot_immutable() returns trigger language plpgsql as $$
begin
  raise exception 'YouTube analysis snapshots are immutable';
end;
$$;
create trigger youtube_runs_immutable before update or delete on public.youtube_analysis_runs for each row execute function public.youtube_snapshot_immutable();
create trigger youtube_videos_immutable before update or delete on public.youtube_video_snapshots for each row execute function public.youtube_snapshot_immutable();

-- A retried workflow step cannot create duplicate or partially saved snapshots.
create function public.save_youtube_analysis(p_batch uuid, p_channel jsonb, p_metrics jsonb, p_warnings jsonb, p_started timestamptz, p_videos jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare run_id uuid;
begin
  perform 1 from public.youtube_analysis_batches where id=p_batch for update;
  if not found then raise exception 'Batch not found'; end if;
  select id into run_id from public.youtube_analysis_runs where batch_id=p_batch and channel_id=p_channel->>'id';
  if run_id is null then
    insert into public.youtube_analysis_runs(batch_id,channel_id,channel,metrics,warnings,started_at)
    values(p_batch,p_channel->>'id',p_channel,p_metrics,p_warnings,p_started) returning id into run_id;
    insert into public.youtube_video_snapshots(run_id,video_id,published_at,data)
    select run_id, v->>'id', (v->>'publishedAt')::timestamptz, v from jsonb_array_elements(p_videos) v;
  end if;
  update public.youtube_analysis_requests set status='completed',error_code=null where batch_id=p_batch and resolved_channel_id=p_channel->>'id';
  return run_id;
end;
$$;
revoke all on function public.save_youtube_analysis(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb) from public,anon,authenticated;
grant execute on function public.save_youtube_analysis(uuid,jsonb,jsonb,jsonb,timestamptz,jsonb) to service_role;

create view public.youtube_latest_analyses with (security_invoker=true) as
select distinct on (b.workspace_id,r.channel_id) r.*, b.workspace_id
from public.youtube_analysis_runs r join public.youtube_analysis_batches b on b.id=r.batch_id
order by b.workspace_id,r.channel_id,r.completed_at desc,r.id desc;
grant select on public.youtube_latest_analyses to authenticated,service_role;
notify pgrst, 'reload schema';
