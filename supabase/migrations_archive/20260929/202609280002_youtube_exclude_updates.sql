-- User-managed relevance flag. Analyzer upserts intentionally leave this
-- column untouched so a channel stays excluded until a user re-enables it.
alter table public.youtube_analyzed_channels
  add column if not exists excluded_from_updates boolean not null default false;

create index if not exists youtube_analyzed_channels_update_candidates_idx
  on public.youtube_analyzed_channels (workspace_id, position)
  where excluded_from_updates = false;

comment on column public.youtube_analyzed_channels.excluded_from_updates
  is 'When true, bulk channel and engagement updates skip this channel.';

notify pgrst, 'reload schema';
