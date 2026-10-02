alter table public.youtube_channel_email_settings
  add column if not exists email_subject text;

alter table public.youtube_channel_email_settings
  drop constraint if exists youtube_channel_email_settings_subject_length;

alter table public.youtube_channel_email_settings
  add constraint youtube_channel_email_settings_subject_length
  check (email_subject is null or char_length(email_subject) <= 500);

comment on column public.youtube_channel_email_settings.email_subject is
  'Workspace-level subject used by YouTube channel Gmail compose links.';

notify pgrst, 'reload schema';
