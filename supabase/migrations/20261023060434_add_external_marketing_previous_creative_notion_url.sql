alter table public.external_marketing_projects
  add column if not exists previous_cohort_creative_notion_url text not null default '';

alter table public.external_marketing_projects
  add constraint external_marketing_previous_creative_notion_url_length_check
  check (char_length(previous_cohort_creative_notion_url) <= 2048);

comment on column public.external_marketing_projects.previous_cohort_creative_notion_url is
  'Notion page URL containing organized advertising creatives from a previous cohort.';

notify pgrst, 'reload schema';
