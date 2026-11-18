alter table public.ad_creative_sources
  add column if not exists webinar_name text not null default '';

alter table public.ad_creative_sources
  add constraint ad_creative_sources_webinar_name_length_check
  check (char_length(webinar_name) <= 300);

comment on column public.ad_creative_sources.webinar_name is
  'Exact webinarName filter applied to Google and Meta creative performance source rows.';
