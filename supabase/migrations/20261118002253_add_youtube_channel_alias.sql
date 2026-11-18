alter table public.youtube_analyzed_channels
  add column if not exists alias text;

alter table public.youtube_analyzed_channels
  add constraint youtube_analyzed_channels_alias_length_check
  check (alias is null or char_length(alias) <= 100);

comment on column public.youtube_analyzed_channels.alias is
  '채널 목록과 강의 출연 채널 검색에 사용할 별명';
