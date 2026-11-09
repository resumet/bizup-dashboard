alter table public.media_notifications
  drop constraint if exists media_notifications_href_check,
  add constraint media_notifications_href_check
  check (
    href like '/%'
    and href not like '//%'
    and char_length(href) <= 500
  );
