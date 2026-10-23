alter table public.external_marketing_projects
  add column affiliate_name text not null default '',
  add column project_manager text not null default '',
  add constraint external_marketing_affiliate_name_length_check
    check (char_length(affiliate_name) <= 120),
  add constraint external_marketing_project_manager_length_check
    check (char_length(project_manager) <= 120);

comment on column public.external_marketing_projects.affiliate_name is
  'Affiliate or related company responsible for the external marketing project.';
comment on column public.external_marketing_projects.project_manager is
  'Project manager responsible for the external marketing project.';

notify pgrst, 'reload schema';
