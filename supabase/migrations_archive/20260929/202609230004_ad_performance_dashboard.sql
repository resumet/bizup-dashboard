create table if not exists public.ad_performance_settings (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  start_date date not null,
  total_budget bigint not null default 0 check (total_budget >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.ad_performance_daily_metrics (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  metric_date date not null,
  google_impressions bigint not null default 0 check (google_impressions >= 0),
  meta_impressions bigint not null default 0 check (meta_impressions >= 0),
  google_clicks bigint not null default 0 check (google_clicks >= 0),
  meta_clicks bigint not null default 0 check (meta_clicks >= 0),
  google_ad_leads bigint not null default 0 check (google_ad_leads >= 0),
  meta_ad_leads bigint not null default 0 check (meta_ad_leads >= 0),
  google_spend bigint not null default 0 check (google_spend >= 0),
  meta_spend bigint not null default 0 check (meta_spend >= 0),
  landing_leads bigint not null default 0 check (landing_leads >= 0),
  google_admin_leads bigint not null default 0 check (google_admin_leads >= 0),
  meta_admin_leads bigint not null default 0 check (meta_admin_leads >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, metric_date)
);

create index if not exists ad_performance_daily_metrics_date_idx
  on public.ad_performance_daily_metrics (workspace_id, metric_date desc);

alter table public.ad_performance_settings enable row level security;
alter table public.ad_performance_daily_metrics enable row level security;

drop policy if exists "members manage ad performance settings" on public.ad_performance_settings;
create policy "members manage ad performance settings" on public.ad_performance_settings
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

drop policy if exists "members manage ad performance daily metrics" on public.ad_performance_daily_metrics;
create policy "members manage ad performance daily metrics" on public.ad_performance_daily_metrics
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));

notify pgrst, 'reload schema';
