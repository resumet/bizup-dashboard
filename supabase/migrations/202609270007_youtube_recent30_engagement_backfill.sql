-- Fill engagement averages for channels analyzed before the recent-30 metrics
-- were added. New analyses save these values through calculate() directly.
with recent_engagement as (
  select
    c.workspace_id,
    c.channel_id,
    count(v.data)::integer as recent30_count,
    avg(case when jsonb_typeof(v.data->'likes') = 'number' then (v.data->>'likes')::numeric end) as recent30_likes,
    avg(case when jsonb_typeof(v.data->'comments') = 'number' then (v.data->>'comments')::numeric end) as recent30_comments
  from public.youtube_analyzed_channels c
  left join lateral (
    select data
    from public.youtube_channel_videos
    where workspace_id = c.workspace_id and channel_id = c.channel_id
    order by published_at desc, video_id asc
    limit 30
  ) v on true
  group by c.workspace_id, c.channel_id
)
update public.youtube_analyzed_channels c
set metrics = c.metrics || jsonb_build_object(
  'recent30Likes', e.recent30_likes,
  'recent30Comments', e.recent30_comments,
  'recent30Count', e.recent30_count
)
from recent_engagement e
where c.workspace_id = e.workspace_id
  and c.channel_id = e.channel_id
  and not (
    c.metrics ? 'recent30Likes'
    and c.metrics ? 'recent30Comments'
    and c.metrics ? 'recent30Count'
  );
