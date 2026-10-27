create index if not exists instructor_intakes_workspace_course_updated_idx
  on public.instructor_intakes (workspace_id, course_id, updated_at desc)
  where course_id is not null;

alter table public.instructor_intakes
  alter column answers set default '{
    "instagramAccountId": "",
    "instagramAccountPassword": "",
    "blueBadge": "",
    "twoFactorSecurity": "",
    "infokLinkId": "",
    "infokLinkPassword": ""
  }'::jsonb;
