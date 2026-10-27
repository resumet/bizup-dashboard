alter table public.courses
  add column webinar_opening_video_url text not null default '',
  add column webinar_youtube_title text not null default '',
  add column webinar_youtube_description text not null default '',
  add column webinar_command_deck_url text not null default 'http://docs.google.com/presentation/d/1glOkbnWTgXufnnUNpcoDIvityzc8EHTyQghgzqpFIKM/edit',
  add column webinar_banner_storage_url text not null default '',
  add column webinar_youtube_live_url text not null default '';

alter table public.courses
  add constraint courses_webinar_opening_video_url_length_check
    check (char_length(webinar_opening_video_url) <= 2048),
  add constraint courses_webinar_youtube_title_length_check
    check (char_length(webinar_youtube_title) <= 200),
  add constraint courses_webinar_youtube_description_length_check
    check (char_length(webinar_youtube_description) <= 5000),
  add constraint courses_webinar_command_deck_url_length_check
    check (char_length(webinar_command_deck_url) <= 2048),
  add constraint courses_webinar_banner_storage_url_length_check
    check (char_length(webinar_banner_storage_url) <= 2048),
  add constraint courses_webinar_youtube_live_url_length_check
    check (char_length(webinar_youtube_live_url) <= 2048);

comment on column public.courses.webinar_opening_video_url is
  '웨비나 시작 전 재생할 기존 라이브 영상 URL';
comment on column public.courses.webinar_youtube_title is
  '웨비나 YouTube 라이브 제목';
comment on column public.courses.webinar_youtube_description is
  '웨비나 YouTube 라이브 설명';
comment on column public.courses.webinar_command_deck_url is
  '웨비나 진행 지령창 URL';
comment on column public.courses.webinar_banner_storage_url is
  '웨비나 배너 및 영상 저장소 URL';
comment on column public.courses.webinar_youtube_live_url is
  '웨비나 YouTube 라이브 URL';
