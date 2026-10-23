create or replace function public.save_public_external_marketing_chat_members(
  p_public_token text,
  p_metric_date date,
  p_chat_members_cumulative bigint
) returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_dashboard_id uuid;
  v_version integer;
  v_manual_inputs jsonb;
  v_existing_input jsonb;
  v_now timestamptz := now();
begin
  if p_public_token is null or p_public_token !~ '^[a-f0-9]{48}$' then
    raise exception '공개 보고서를 찾을 수 없습니다.' using errcode = 'PT404';
  end if;
  if p_metric_date is null then
    raise exception '날짜가 올바르지 않습니다.' using errcode = 'PT400';
  end if;
  if p_chat_members_cumulative is not null
    and (p_chat_members_cumulative < 0 or p_chat_members_cumulative > 9007199254740991) then
    raise exception '단톡방 누적 입장 인원이 올바르지 않습니다.' using errcode = 'PT400';
  end if;

  select project.dashboard_id, state.version, state.manual_inputs
    into v_dashboard_id, v_version, v_manual_inputs
  from public.external_marketing_projects project
  join public.ad_performance_dashboards dashboard
    on dashboard.id = project.dashboard_id
   and dashboard.workspace_id = project.workspace_id
   and dashboard.service_scope = 'external_marketing'
  join public.ad_performance_sheet_states state
    on state.dashboard_id = project.dashboard_id
  where project.public_token = p_public_token
    and project.public_enabled
  for update of state;

  if v_dashboard_id is null or not exists (
    select 1
    from public.ad_performance_dashboard_metrics metric
    where metric.dashboard_id = v_dashboard_id
      and metric.metric_date = p_metric_date
      and metric.managed_by_sheet
  ) then
    raise exception '공개 보고서의 날짜를 찾을 수 없습니다.' using errcode = 'PT404';
  end if;

  v_existing_input := coalesce(v_manual_inputs -> p_metric_date::text, '{}'::jsonb);
  if p_chat_members_cumulative is null
    and coalesce(v_existing_input -> 'bizupDbCumulative', 'null'::jsonb) = 'null'::jsonb then
    v_manual_inputs := v_manual_inputs - p_metric_date::text;
  else
    v_manual_inputs := jsonb_set(
      v_manual_inputs,
      array[p_metric_date::text],
      jsonb_build_object(
        'bizupDbCumulative', coalesce(v_existing_input -> 'bizupDbCumulative', 'null'::jsonb),
        'chatMembersCumulative', to_jsonb(p_chat_members_cumulative)
      ),
      true
    );
  end if;

  update public.ad_performance_sheet_states
  set manual_inputs = v_manual_inputs,
      version = v_version + 1,
      updated_at = v_now
  where dashboard_id = v_dashboard_id;

  update public.ad_performance_dashboard_metrics
  set chat_room_members = p_chat_members_cumulative,
      updated_at = v_now
  where dashboard_id = v_dashboard_id
    and metric_date = p_metric_date
    and managed_by_sheet;

  update public.ad_performance_dashboards
  set updated_at = v_now
  where id = v_dashboard_id;

  return v_version + 1;
end;
$$;

revoke all on function public.save_public_external_marketing_chat_members(text, date, bigint)
  from public, anon, authenticated;
grant execute on function public.save_public_external_marketing_chat_members(text, date, bigint)
  to service_role;

comment on function public.save_public_external_marketing_chat_members(text, date, bigint) is
  'Updates a public external-marketing report date cumulative chat member count through a server-side capability token.';
comment on column public.external_marketing_projects.public_token is
  'Capability token for the public report and its narrowly scoped public inputs; keep confidential and validate server-side.';

notify pgrst, 'reload schema';
