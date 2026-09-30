create table if not exists public.ad_performance_sheet_states (
  dashboard_id uuid primary key references public.ad_performance_dashboards(id) on delete cascade,
  spreadsheet_url text not null,
  spreadsheet_id text not null,
  sheet_name text not null,
  source_rows jsonb not null default '[]'::jsonb,
  tracking_file_name text,
  tracking_data jsonb,
  manual_inputs jsonb not null default '{}'::jsonb,
  version integer not null default 1,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint ad_performance_sheet_states_spreadsheet_url_check
    check (char_length(spreadsheet_url) between 1 and 2048),
  constraint ad_performance_sheet_states_spreadsheet_id_check
    check (spreadsheet_id ~ '^[A-Za-z0-9_-]{10,200}$'),
  constraint ad_performance_sheet_states_sheet_name_check
    check (char_length(btrim(sheet_name)) between 1 and 200),
  constraint ad_performance_sheet_states_tracking_file_name_check
    check (tracking_file_name is null or char_length(tracking_file_name) between 1 and 255),
  constraint ad_performance_sheet_states_source_rows_check
    check (jsonb_typeof(source_rows) = 'array'),
  constraint ad_performance_sheet_states_tracking_data_check
    check (tracking_data is null or jsonb_typeof(tracking_data) = 'object'),
  constraint ad_performance_sheet_states_manual_inputs_check
    check (jsonb_typeof(manual_inputs) = 'object'),
  constraint ad_performance_sheet_states_version_check check (version >= 1)
);

alter table public.ad_performance_sheet_states enable row level security;

create policy "members manage ad performance sheet states"
on public.ad_performance_sheet_states
to authenticated
using (
  exists (
    select 1
    from public.ad_performance_dashboards dashboard
    where dashboard.id = ad_performance_sheet_states.dashboard_id
      and public.is_workspace_member(dashboard.workspace_id)
  )
)
with check (
  exists (
    select 1
    from public.ad_performance_dashboards dashboard
    where dashboard.id = ad_performance_sheet_states.dashboard_id
      and public.is_workspace_member(dashboard.workspace_id)
  )
);

alter table public.ad_performance_dashboard_metrics
  add column if not exists managed_by_sheet boolean not null default false;

alter table public.ad_performance_organic_channels
  add column if not exists managed_by_sheet boolean not null default false;

alter table public.ad_performance_organic_metric_values
  add column if not exists managed_by_sheet boolean not null default false;

create or replace function public.save_ad_performance_sheet_state(
  p_dashboard_id uuid,
  p_actor_id uuid,
  p_expected_version integer,
  p_spreadsheet_url text,
  p_spreadsheet_id text,
  p_sheet_name text,
  p_source_rows jsonb,
  p_tracking_file_name text,
  p_tracking_data jsonb,
  p_manual_inputs jsonb,
  p_metric_snapshot jsonb
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_workspace_id uuid;
  v_current_version integer;
  v_next_version integer;
  v_now timestamptz := now();
begin
  select workspace_id
    into v_workspace_id
  from public.ad_performance_dashboards
  where id = p_dashboard_id
  for update;

  if v_workspace_id is null or not exists (
    select 1
    from public.workspace_members
    where workspace_id = v_workspace_id
      and user_id = p_actor_id
  ) then
    raise exception '광고성과 대시보드를 찾을 수 없거나 접근 권한이 없습니다.';
  end if;

  if p_expected_version is null or p_expected_version < 0 then
    raise exception '시트 데이터 버전이 올바르지 않습니다.';
  end if;
  if p_spreadsheet_url is null or char_length(p_spreadsheet_url) not between 1 and 2048 then
    raise exception '원본 Google Sheets URL이 올바르지 않습니다.';
  end if;
  if p_spreadsheet_id is null or p_spreadsheet_id !~ '^[A-Za-z0-9_-]{10,200}$' then
    raise exception 'Google Sheets 문서 ID가 올바르지 않습니다.';
  end if;
  if p_sheet_name is null or char_length(btrim(p_sheet_name)) not between 1 and 200 then
    raise exception '시트 이름이 올바르지 않습니다.';
  end if;
  if jsonb_typeof(p_source_rows) <> 'array'
    or jsonb_typeof(p_manual_inputs) <> 'object'
    or jsonb_typeof(p_metric_snapshot) <> 'array'
    or (p_tracking_data is not null and jsonb_typeof(p_tracking_data) <> 'object') then
    raise exception '시트 저장 데이터 형식이 올바르지 않습니다.';
  end if;

  select version
    into v_current_version
  from public.ad_performance_sheet_states
  where dashboard_id = p_dashboard_id
  for update;

  if v_current_version is null then
    if p_expected_version <> 0 then
      raise exception '다른 사용자가 시트 데이터를 변경했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    v_next_version := 1;
  else
    if p_expected_version <> v_current_version then
      raise exception '다른 사용자가 시트 데이터를 변경했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;
    v_next_version := v_current_version + 1;
  end if;

  create temporary table if not exists pg_temp.ad_sheet_metrics (
    metric_date date primary key,
    google_impressions bigint not null,
    meta_impressions bigint not null,
    google_clicks bigint not null,
    meta_clicks bigint not null,
    google_ad_leads bigint not null,
    meta_ad_leads bigint not null,
    google_spend bigint not null,
    meta_spend bigint not null,
    google_landing_leads bigint not null,
    meta_landing_leads bigint not null,
    admin_cumulative_leads bigint not null,
    chat_room_members bigint,
    organic_leads jsonb not null
  ) on commit drop;
  truncate pg_temp.ad_sheet_metrics;

  insert into pg_temp.ad_sheet_metrics (
    metric_date,
    google_impressions,
    meta_impressions,
    google_clicks,
    meta_clicks,
    google_ad_leads,
    meta_ad_leads,
    google_spend,
    meta_spend,
    google_landing_leads,
    meta_landing_leads,
    admin_cumulative_leads,
    chat_room_members,
    organic_leads
  )
  select
    (item->>'metricDate')::date,
    (item->>'googleImpressions')::bigint,
    (item->>'metaImpressions')::bigint,
    (item->>'googleClicks')::bigint,
    (item->>'metaClicks')::bigint,
    (item->>'googleAdLeads')::bigint,
    (item->>'metaAdLeads')::bigint,
    (item->>'googleSpend')::bigint,
    (item->>'metaSpend')::bigint,
    (item->>'googleLandingLeads')::bigint,
    (item->>'metaLandingLeads')::bigint,
    (item->>'adminCumulativeLeads')::bigint,
    nullif(item->>'chatRoomMembers', '')::bigint,
    coalesce(item->'organicLeadsByName', '{}'::jsonb)
  from jsonb_array_elements(p_metric_snapshot) item;

  if exists (
    select 1
    from pg_temp.ad_sheet_metrics
    where google_impressions < 0
       or meta_impressions < 0
       or google_clicks < 0
       or meta_clicks < 0
       or google_ad_leads < 0
       or meta_ad_leads < 0
       or google_spend < 0
       or meta_spend < 0
       or google_landing_leads < 0
       or meta_landing_leads < 0
       or admin_cumulative_leads < 0
       or chat_room_members < 0
       or jsonb_typeof(organic_leads) <> 'object'
  ) then
    raise exception '음수이거나 올바르지 않은 광고성과 값은 저장할 수 없습니다.';
  end if;

  insert into public.ad_performance_sheet_states (
    dashboard_id,
    spreadsheet_url,
    spreadsheet_id,
    sheet_name,
    source_rows,
    tracking_file_name,
    tracking_data,
    manual_inputs,
    version,
    created_by,
    updated_by,
    updated_at
  ) values (
    p_dashboard_id,
    p_spreadsheet_url,
    p_spreadsheet_id,
    btrim(p_sheet_name),
    p_source_rows,
    nullif(btrim(p_tracking_file_name), ''),
    p_tracking_data,
    p_manual_inputs,
    v_next_version,
    p_actor_id,
    p_actor_id,
    v_now
  )
  on conflict (dashboard_id) do update set
    spreadsheet_url = excluded.spreadsheet_url,
    spreadsheet_id = excluded.spreadsheet_id,
    sheet_name = excluded.sheet_name,
    source_rows = excluded.source_rows,
    tracking_file_name = excluded.tracking_file_name,
    tracking_data = excluded.tracking_data,
    manual_inputs = excluded.manual_inputs,
    version = excluded.version,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  insert into public.ad_performance_dashboard_metrics (
    dashboard_id,
    metric_date,
    google_impressions,
    meta_impressions,
    google_clicks,
    meta_clicks,
    google_ad_leads,
    meta_ad_leads,
    google_spend,
    meta_spend,
    google_landing_leads,
    meta_landing_leads,
    admin_cumulative_leads,
    chat_room_members,
    managed_by_sheet,
    created_by,
    updated_by,
    updated_at
  )
  select
    p_dashboard_id,
    metric_date,
    google_impressions,
    meta_impressions,
    google_clicks,
    meta_clicks,
    google_ad_leads,
    meta_ad_leads,
    google_spend,
    meta_spend,
    google_landing_leads,
    meta_landing_leads,
    admin_cumulative_leads,
    chat_room_members,
    true,
    p_actor_id,
    p_actor_id,
    v_now
  from pg_temp.ad_sheet_metrics
  on conflict (dashboard_id, metric_date) do update set
    google_impressions = excluded.google_impressions,
    meta_impressions = excluded.meta_impressions,
    google_clicks = excluded.google_clicks,
    meta_clicks = excluded.meta_clicks,
    google_ad_leads = excluded.google_ad_leads,
    meta_ad_leads = excluded.meta_ad_leads,
    google_spend = excluded.google_spend,
    meta_spend = excluded.meta_spend,
    google_landing_leads = excluded.google_landing_leads,
    meta_landing_leads = excluded.meta_landing_leads,
    admin_cumulative_leads = excluded.admin_cumulative_leads,
    chat_room_members = excluded.chat_room_members,
    managed_by_sheet = true,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  delete from public.ad_performance_organic_metric_values
  where dashboard_id = p_dashboard_id
    and managed_by_sheet;

  insert into public.ad_performance_organic_channels (
    dashboard_id,
    name,
    sort_order,
    managed_by_sheet,
    created_by
  )
  select
    p_dashboard_id,
    channel.name,
    (row_number() over (order by channel.first_seen, channel.name) - 1)::smallint,
    true,
    p_actor_id
  from (
    select key as name, min(metric_date) as first_seen
    from pg_temp.ad_sheet_metrics,
      lateral jsonb_each(organic_leads)
    where char_length(btrim(key)) between 1 and 80
    group by key
  ) channel
  on conflict (dashboard_id, name) do update set
    sort_order = excluded.sort_order,
    managed_by_sheet = true;

  insert into public.ad_performance_organic_metric_values (
    dashboard_id,
    channel_id,
    metric_date,
    lead_count,
    managed_by_sheet,
    created_by,
    updated_by,
    updated_at
  )
  select
    p_dashboard_id,
    channel.id,
    metric.metric_date,
    (lead.value #>> '{}')::bigint,
    true,
    p_actor_id,
    p_actor_id,
    v_now
  from pg_temp.ad_sheet_metrics metric
  cross join lateral jsonb_each(metric.organic_leads) lead
  join public.ad_performance_organic_channels channel
    on channel.dashboard_id = p_dashboard_id
   and channel.name = lead.key
  where (lead.value #>> '{}')::bigint >= 0
  on conflict (dashboard_id, channel_id, metric_date) do update set
    lead_count = excluded.lead_count,
    managed_by_sheet = true,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;

  delete from public.ad_performance_organic_channels channel
  where channel.dashboard_id = p_dashboard_id
    and channel.managed_by_sheet
    and not exists (
      select 1
      from pg_temp.ad_sheet_metrics metric
      cross join lateral jsonb_object_keys(metric.organic_leads) as entry(name)
      where entry.name = channel.name
    );

  delete from public.ad_performance_dashboard_metrics metric
  where metric.dashboard_id = p_dashboard_id
    and metric.managed_by_sheet
    and not exists (
      select 1
      from pg_temp.ad_sheet_metrics source_metric
      where source_metric.metric_date = metric.metric_date
    );

  update public.ad_performance_dashboards
  set updated_by = p_actor_id,
      updated_at = v_now
  where id = p_dashboard_id;

  return v_next_version;
end;
$$;

revoke all on function public.save_ad_performance_sheet_state(
  uuid, uuid, integer, text, text, text, jsonb, text, jsonb, jsonb, jsonb
) from public, anon, authenticated;
grant execute on function public.save_ad_performance_sheet_state(
  uuid, uuid, integer, text, text, text, jsonb, text, jsonb, jsonb, jsonb
) to service_role;

grant select, insert, update, delete on table public.ad_performance_sheet_states to authenticated;
grant all on table public.ad_performance_sheet_states to service_role;
