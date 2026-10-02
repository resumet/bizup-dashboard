alter table public.youtube_analyzed_channels
  add column if not exists appearance_request_email_sent boolean not null default false;

comment on column public.youtube_analyzed_channels.appearance_request_email_sent
  is 'Whether an appearance request email has been sent to this channel.';
