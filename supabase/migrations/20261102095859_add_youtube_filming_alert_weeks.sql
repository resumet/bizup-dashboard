alter table public.workspaces
  add column if not exists youtube_filming_alert_weeks smallint not null default 4;

alter table public.workspaces
  drop constraint if exists workspaces_youtube_filming_alert_weeks_check;

alter table public.workspaces
  add constraint workspaces_youtube_filming_alert_weeks_check
  check (youtube_filming_alert_weeks in (3, 4, 5, 6));

comment on column public.workspaces.youtube_filming_alert_weeks is
  '무료강의일 기준 유튜브 촬영 일정 미확정 알림 시작 주차';
