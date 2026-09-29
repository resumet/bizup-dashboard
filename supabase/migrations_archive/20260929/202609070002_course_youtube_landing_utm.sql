alter table public.course_youtube_appearances
  add column if not exists landing_utm text not null default '';
