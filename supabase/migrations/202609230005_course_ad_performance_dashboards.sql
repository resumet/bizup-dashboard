create table if not exists public.ad_performance_dashboards (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  start_date date not null,
  total_budget bigint not null default 0 check (total_budget >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  unique (workspace_id, course_id)
);

create table if not exists public.ad_performance_dashboard_metrics (
  dashboard_id uuid not null references public.ad_performance_dashboards(id) on delete cascade,
  metric_date date not null,
  google_impressions bigint not null default 0 check (google_impressions >= 0),
  meta_impressions bigint not null default 0 check (meta_impressions >= 0),
  google_clicks bigint not null default 0 check (google_clicks >= 0),
  meta_clicks bigint not null default 0 check (meta_clicks >= 0),
  google_ad_leads bigint not null default 0 check (google_ad_leads >= 0),
  meta_ad_leads bigint not null default 0 check (meta_ad_leads >= 0),
  google_spend bigint not null default 0 check (google_spend >= 0),
  meta_spend bigint not null default 0 check (meta_spend >= 0),
  google_landing_leads bigint not null default 0 check (google_landing_leads >= 0),
  meta_landing_leads bigint not null default 0 check (meta_landing_leads >= 0),
  admin_cumulative_leads bigint not null default 0 check (admin_cumulative_leads >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (dashboard_id, metric_date)
);

create table if not exists public.ad_performance_organic_channels (
  id uuid primary key default gen_random_uuid(),
  dashboard_id uuid not null references public.ad_performance_dashboards(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (dashboard_id, id),
  unique (dashboard_id, name)
);

create table if not exists public.ad_performance_organic_metric_values (
  dashboard_id uuid not null,
  channel_id uuid not null,
  metric_date date not null,
  lead_count bigint not null default 0 check (lead_count >= 0),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (dashboard_id, channel_id, metric_date),
  foreign key (dashboard_id, metric_date)
    references public.ad_performance_dashboard_metrics(dashboard_id, metric_date) on delete cascade,
  foreign key (dashboard_id, channel_id)
    references public.ad_performance_organic_channels(dashboard_id, id) on delete cascade
);

create index if not exists ad_performance_dashboards_workspace_idx
  on public.ad_performance_dashboards (workspace_id, updated_at desc);
create index if not exists ad_performance_dashboard_metrics_date_idx
  on public.ad_performance_dashboard_metrics (dashboard_id, metric_date desc);
create index if not exists ad_performance_organic_channels_order_idx
  on public.ad_performance_organic_channels (dashboard_id, sort_order, created_at);
create index if not exists ad_performance_organic_metric_values_date_idx
  on public.ad_performance_organic_metric_values (dashboard_id, metric_date);

create or replace view public.ad_performance_dashboard_summaries
with (security_invoker = true) as
select
  dashboard.id,
  dashboard.workspace_id,
  dashboard.course_id,
  dashboard.start_date,
  dashboard.total_budget,
  dashboard.updated_at,
  (select count(*) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id)::bigint as metric_count,
  coalesce((select sum(metric.google_spend + metric.meta_spend) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id), 0)::bigint as spend,
  coalesce((select sum(metric.google_ad_leads + metric.meta_ad_leads) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id), 0)::bigint as ad_leads,
  coalesce((select sum(metric.google_landing_leads + metric.meta_landing_leads) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id), 0)::bigint as paid_landing_leads,
  coalesce((select sum(value.lead_count) from public.ad_performance_organic_metric_values value where value.dashboard_id = dashboard.id), 0)::bigint as organic_landing_leads,
  coalesce((select metric.admin_cumulative_leads from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id order by metric.metric_date desc limit 1), 0)::bigint as admin_cumulative_leads
from public.ad_performance_dashboards dashboard;

alter table public.ad_performance_dashboards enable row level security;
alter table public.ad_performance_dashboard_metrics enable row level security;
alter table public.ad_performance_organic_channels enable row level security;
alter table public.ad_performance_organic_metric_values enable row level security;

drop policy if exists "members manage course ad performance dashboards" on public.ad_performance_dashboards;
create policy "members manage course ad performance dashboards" on public.ad_performance_dashboards
  for all to authenticated
  using (public.is_workspace_member(workspace_id))
  with check (
    public.is_workspace_member(workspace_id)
    and exists (
      select 1 from public.courses
      where courses.id = course_id and courses.workspace_id = ad_performance_dashboards.workspace_id
    )
  );

drop policy if exists "members manage course ad performance metrics" on public.ad_performance_dashboard_metrics;
create policy "members manage course ad performance metrics" on public.ad_performance_dashboard_metrics
  for all to authenticated
  using (
    exists (
      select 1 from public.ad_performance_dashboards
      where ad_performance_dashboards.id = dashboard_id
        and public.is_workspace_member(ad_performance_dashboards.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_performance_dashboards
      where ad_performance_dashboards.id = dashboard_id
        and public.is_workspace_member(ad_performance_dashboards.workspace_id)
    )
  );

drop policy if exists "members manage ad performance organic channels" on public.ad_performance_organic_channels;
create policy "members manage ad performance organic channels" on public.ad_performance_organic_channels
  for all to authenticated
  using (
    exists (
      select 1 from public.ad_performance_dashboards
      where ad_performance_dashboards.id = dashboard_id
        and public.is_workspace_member(ad_performance_dashboards.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_performance_dashboards
      where ad_performance_dashboards.id = dashboard_id
        and public.is_workspace_member(ad_performance_dashboards.workspace_id)
    )
  );

drop policy if exists "members manage ad performance organic values" on public.ad_performance_organic_metric_values;
create policy "members manage ad performance organic values" on public.ad_performance_organic_metric_values
  for all to authenticated
  using (
    exists (
      select 1 from public.ad_performance_dashboards
      where ad_performance_dashboards.id = dashboard_id
        and public.is_workspace_member(ad_performance_dashboards.workspace_id)
    )
  )
  with check (
    exists (
      select 1 from public.ad_performance_dashboards
      where ad_performance_dashboards.id = dashboard_id
        and public.is_workspace_member(ad_performance_dashboards.workspace_id)
    )
  );

comment on table public.ad_performance_settings is
  'Legacy workspace-wide settings retained for safe rollback after course dashboards were introduced.';
comment on table public.ad_performance_daily_metrics is
  'Legacy workspace-wide metrics retained for safe rollback after course dashboards were introduced.';

notify pgrst, 'reload schema';
