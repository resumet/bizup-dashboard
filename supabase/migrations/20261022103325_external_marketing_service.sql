create table public.external_marketing_projects (
  dashboard_id uuid primary key references public.ad_performance_dashboards(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_name text not null default '',
  instructor_name text not null default '',
  cohort text not null default '',
  landing_pages jsonb not null default '[]'::jsonb,
  creative_drive_url text not null default '',
  intake_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  public_token text not null unique default encode(extensions.gen_random_bytes(24), 'hex'),
  intake_enabled boolean not null default true,
  public_enabled boolean not null default false,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint external_marketing_course_name_check check (char_length(course_name) <= 200),
  constraint external_marketing_instructor_name_check check (char_length(instructor_name) <= 120),
  constraint external_marketing_cohort_check check (char_length(cohort) <= 80),
  constraint external_marketing_landing_pages_check check (jsonb_typeof(landing_pages) = 'array'),
  constraint external_marketing_creative_drive_url_check check (char_length(creative_drive_url) <= 2048),
  constraint external_marketing_intake_token_check check (intake_token ~ '^[a-f0-9]{48}$'),
  constraint external_marketing_public_token_check check (public_token ~ '^[a-f0-9]{48}$')
);

create index external_marketing_projects_workspace_idx
  on public.external_marketing_projects (workspace_id, updated_at desc);
create index external_marketing_projects_created_by_idx
  on public.external_marketing_projects (created_by);
create index external_marketing_projects_updated_by_idx
  on public.external_marketing_projects (updated_by);

alter table public.external_marketing_projects enable row level security;

create policy "members manage external marketing projects"
  on public.external_marketing_projects
  for all
  to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1
      from public.ad_performance_dashboards dashboard
      where dashboard.id = dashboard_id
        and dashboard.workspace_id = external_marketing_projects.workspace_id
        and dashboard.course_id is null
    )
  );

revoke all on table public.external_marketing_projects from public, anon;
grant select, insert, update, delete on table public.external_marketing_projects to authenticated;
grant all on table public.external_marketing_projects to service_role;

comment on table public.external_marketing_projects is
  'External agency projects backed by the shared advertising performance dashboard without a course association.';
comment on column public.external_marketing_projects.intake_token is
  'Unpredictable token for the external project information form. Read only through server-side service-role code.';
comment on column public.external_marketing_projects.public_token is
  'Unpredictable token for the read-only public performance report. Read only through server-side service-role code.';

notify pgrst, 'reload schema';
