-- Apply approved exclusions and normal reconciliation together, retaining all student details.
create or replace function public.apply_paid_roster_review(p_course_id uuid, p_actor_id uuid, p_snapshot jsonb, p_changes jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_course public.courses%rowtype; v_job public.course_jobs%rowtype;
  v_change jsonb; v_row public.job_enrollments%rowtype; v_regular jsonb;
  v_ids uuid[] := array[]::uuid[]; v_target uuid; v_result uuid;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then raise exception '유료수강생 명단을 관리할 권한이 없습니다.'; end if;
  select * into v_job from public.course_jobs where course_id = p_course_id and is_order_roster for update;
  perform 1 from public.course_orders where course_id = p_course_id for update;
  perform 1 from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version for update;
  if public.paid_roster_snapshot(p_course_id, p_actor_id) is distinct from p_snapshot then
    raise exception '주문 또는 수강생 정보가 변경되었습니다. 미리보기를 다시 열어 확인해 주세요.';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 10000 then
    raise exception '반영할 항목을 선택해 주세요.';
  end if;
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_regular from jsonb_array_elements(p_changes) c
    where coalesce(c->>'kind', '') <> 'remove';
  for v_change in select value from jsonb_array_elements(p_changes) where value->>'kind' = 'remove' loop
    v_target := (v_change->>'targetId')::uuid;
    select * into v_row from public.job_enrollments where id = v_target and job_id = v_job.id and version = v_job.latest_version;
    if v_row.id is null or v_target = any(v_ids) or v_row.is_manually_added
      or coalesce(v_row.normalized_values->>'refundedAt', '') <> ''
      or coalesce(v_row.normalized_values->>'orderRecordKey', '') = '' then
      raise exception '제외할 수강생을 다시 확인해 주세요.';
    end if;
    -- A present order must explicitly be cancelled/refunded with no remaining payment.
    if exists (select 1 from public.course_orders o where o.course_id = p_course_id
      and o.record_key = v_row.normalized_values->>'orderRecordKey'
      and not (o.current_amount = 0 and normalize(o.status, NFKC) ~ '(취소|환불)')) then
      raise exception '취소·환불되지 않은 주문은 제외할 수 없습니다.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_regular) c where c->>'targetId' = v_target::text
      or (c->'removeIds') @> jsonb_build_array(v_target::text)) then
      raise exception '갱신 대상과 제외 대상이 겹칩니다. 미리보기를 다시 확인해 주세요.';
    end if;
    v_ids := array_append(v_ids, v_target);
  end loop;
  -- Nothing is modified until every approved exclusion has passed validation.
  update public.job_enrollments set normalized_values = normalized_values || jsonb_build_object(
    'refundedAt', now(), 'refundedBy', p_actor_id, 'refundSource', 'order_roster_review'
  ) where id = any(v_ids) and job_id = v_job.id and version = v_job.latest_version;
  v_result := v_job.id;
  if jsonb_array_length(v_regular) > 0 then
    -- Existing reconciliation carries the archive flags and all prior data to the new version.
    v_result := public.apply_paid_roster_changes(p_course_id, p_actor_id,
      public.paid_roster_snapshot(p_course_id, p_actor_id), v_regular);
  end if;
  if cardinality(v_ids) > 0 then
    insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
      values(v_course.workspace_id, p_actor_id, 'course_job.order_removals_approved', 'course_job', v_job.id,
        jsonb_build_object('version', v_job.latest_version, 'enrollmentIds', to_jsonb(v_ids), 'changes', p_changes));
  end if;
  return v_result;
end;
$$;
revoke all on function public.apply_paid_roster_review(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_paid_roster_review(uuid, uuid, jsonb, jsonb) to service_role;
