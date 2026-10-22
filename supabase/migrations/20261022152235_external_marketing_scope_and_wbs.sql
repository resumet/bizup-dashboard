alter table public.ad_performance_dashboards
  add column service_scope text not null default 'bizup'
    check (service_scope in ('bizup', 'external_marketing'));

-- Classify existing projects without moving or recreating any metrics or files.
update public.ad_performance_dashboards dashboard
set service_scope = 'external_marketing'
where exists (select 1 from public.external_marketing_projects project where project.dashboard_id = dashboard.id);

alter table public.ad_performance_dashboards
  add constraint external_dashboard_has_no_bizup_course check (service_scope <> 'external_marketing' or course_id is null),
  add constraint dashboard_workspace_scope_key unique (id, workspace_id, service_scope);
create index ad_performance_workspace_scope_idx on public.ad_performance_dashboards(workspace_id, service_scope);

alter table public.external_marketing_projects
  add column webinar_date date,
  add column dashboard_scope text generated always as ('external_marketing'::text) stored,
  add constraint external_project_dashboard_scope_fkey
    foreign key (dashboard_id, workspace_id, dashboard_scope)
    references public.ad_performance_dashboards(id, workspace_id, service_scope) on delete cascade;

-- Keep creation compatible with the old application during the Git deployment.
-- This invoker trigger retains the existing workspace RLS checks.
create function public.classify_external_marketing_dashboard() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  update public.ad_performance_dashboards
  set service_scope = 'external_marketing'
  where id = new.dashboard_id and workspace_id = new.workspace_id and course_id is null;
  if not found then
    raise exception 'External project requires an unassigned dashboard in the same workspace' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function public.classify_external_marketing_dashboard() from public, anon, authenticated;
create trigger classify_external_marketing_dashboard
before insert or update of dashboard_id, workspace_id on public.external_marketing_projects
for each row execute function public.classify_external_marketing_dashboard();

create or replace view public.ad_performance_dashboard_summaries with (security_invoker = true) as
select dashboard.id, dashboard.workspace_id, dashboard.course_id, dashboard.start_date, dashboard.total_budget, dashboard.updated_at,
  (select count(*) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id)::bigint as metric_count,
  coalesce((select sum(metric.google_spend + metric.meta_spend) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id), 0)::bigint as spend,
  coalesce((select sum(metric.google_ad_leads + metric.meta_ad_leads) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id), 0)::bigint as ad_leads,
  coalesce((select sum(metric.google_landing_leads + metric.meta_landing_leads) from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id), 0)::bigint as paid_landing_leads,
  coalesce((select sum(value.lead_count) from public.ad_performance_organic_metric_values value where value.dashboard_id = dashboard.id), 0)::bigint as organic_landing_leads,
  coalesce((select metric.admin_cumulative_leads from public.ad_performance_dashboard_metrics metric where metric.dashboard_id = dashboard.id order by metric.metric_date desc limit 1), 0)::bigint as admin_cumulative_leads,
  dashboard.service_scope
from public.ad_performance_dashboards dashboard;

comment on column public.ad_performance_dashboards.service_scope is 'Owning service. Metrics, sheet state and files remain attached to this scoped dashboard.';
comment on column public.external_marketing_projects.webinar_date is 'Asia/Seoul webinar calendar date; WBS milestones are derived from this date.';
notify pgrst, 'reload schema';
