create or replace function public.youtube_channel_recent_videos(
  p_workspace_id uuid,
  p_channel_ids text[],
  p_limit integer default 30
)
returns table (
  channel_id text,
  video_id text,
  published_at timestamptz,
  data jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select ranked.channel_id, ranked.video_id, ranked.published_at, ranked.data
  from (
    select
      videos.channel_id,
      videos.video_id,
      videos.published_at,
      videos.data,
      row_number() over (
        partition by videos.channel_id
        order by videos.published_at desc, videos.video_id asc
      ) as row_number
    from public.youtube_channel_videos as videos
    where videos.workspace_id = p_workspace_id
      and videos.channel_id = any(p_channel_ids)
  ) as ranked
  where ranked.row_number <= greatest(1, least(p_limit, 30))
  order by ranked.channel_id, ranked.published_at desc, ranked.video_id asc;
$$;

revoke execute on function public.youtube_channel_recent_videos(uuid, text[], integer) from public, anon, authenticated;
grant execute on function public.youtube_channel_recent_videos(uuid, text[], integer) to service_role;
