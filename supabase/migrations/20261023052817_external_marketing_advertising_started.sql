alter table public.external_marketing_projects
  add column advertising_started boolean not null default false;

comment on column public.external_marketing_projects.advertising_started is
  'Whether advertising execution has actually started for the external marketing project.';

notify pgrst, 'reload schema';
