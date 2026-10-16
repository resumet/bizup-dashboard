alter table public.course_youtube_settings
  add column public_short_code text not null default rtrim(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'), '=')
    check (public_short_code ~ '^[A-Za-z0-9_-]{16}$'),
  add column brief_short_code text not null default rtrim(translate(encode(extensions.gen_random_bytes(12), 'base64'), '+/', '-_'), '=')
    check (brief_short_code ~ '^[A-Za-z0-9_-]{16}$');

create unique index course_youtube_settings_public_short_code_key
  on public.course_youtube_settings(public_short_code);
create unique index course_youtube_settings_brief_short_code_key
  on public.course_youtube_settings(brief_short_code);
