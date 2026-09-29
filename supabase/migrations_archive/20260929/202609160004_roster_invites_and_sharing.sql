-- Invitation drafts belong to a saved roster, not to a browser or workspace-wide suggestion.
create table public.course_job_invites (
  job_id uuid not null references public.course_jobs(id) on delete cascade,
  option_name text not null check (char_length(option_name) between 1 and 500),
  entry_code text not null default '' check (char_length(entry_code) <= 100),
  link_name text not null default '' check (char_length(link_name) <= 2048),
  updated_at timestamptz not null default now(),
  primary key (job_id, option_name)
);
alter table public.course_job_invites enable row level security;
create policy course_job_invites_member_read on public.course_job_invites for select to authenticated
using (exists (
  select 1 from public.course_jobs j join public.workspace_members m on m.workspace_id = j.workspace_id
  where j.id = course_job_invites.job_id and m.user_id = auth.uid()
));
grant select on public.course_job_invites to authenticated;
grant all on public.course_job_invites to service_role;

alter table public.courses add column order_roster_share_masked boolean not null default true;
-- Existing links keep their visibility and are masked; new courses require explicit publication.
alter table public.courses alter column order_roster_share_enabled set default false;
