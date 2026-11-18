alter table public.ad_creative_sources
  add column if not exists matching_keywords text not null default '';

alter table public.ad_creative_sources
  add constraint ad_creative_sources_matching_keywords_length_check
  check (char_length(matching_keywords) <= 1000);

comment on column public.ad_creative_sources.matching_keywords is
  'Pipe-delimited keywords used to select matching advertising rows from the source sheet.';
