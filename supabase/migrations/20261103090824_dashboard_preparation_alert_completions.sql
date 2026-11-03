create table public.dashboard_preparation_alert_completions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  alert_key text not null check (char_length(alert_key) between 1 and 300),
  alert_type text not null check (alert_type in ('instagram_filming_plan', 'ad_filming_plan', 'webinar_assets', 'course_materials')),
  title text not null check (char_length(title) between 1 and 300),
  description text not null default '' check (char_length(description) <= 1000),
  due_date date not null,
  completed_by uuid references auth.users(id) on delete set null,
  completed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (workspace_id, alert_key)
);

create index dashboard_preparation_alert_completions_workspace_completed_idx
  on public.dashboard_preparation_alert_completions(workspace_id, completed_at desc);

alter table public.dashboard_preparation_alert_completions enable row level security;
revoke all on public.dashboard_preparation_alert_completions from anon, authenticated;
grant select on public.dashboard_preparation_alert_completions to authenticated;
grant all on public.dashboard_preparation_alert_completions to service_role;

create policy dashboard_preparation_alert_completions_read
  on public.dashboard_preparation_alert_completions for select to authenticated
  using ((select public.is_workspace_member(workspace_id)));
