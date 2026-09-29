-- A consistent preview, followed by an atomic, explicitly selected reconciliation.
create function public.paid_roster_snapshot(p_course_id uuid, p_actor_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_course public.courses%rowtype; v_job public.course_jobs%rowtype;
begin
  select * into v_course from public.courses where id = p_course_id;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then raise exception '유료수강생 명단을 관리할 권한이 없습니다.'; end if;
  select * into v_job from public.course_jobs where course_id = p_course_id and is_order_roster;
  return jsonb_build_object('courseName', v_course.name, 'jobId', v_job.id, 'version', coalesce(v_job.latest_version, 0),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.course_orders o where course_id = p_course_id), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.job_enrollments e
      where job_id = v_job.id and version = v_job.latest_version), '[]'::jsonb));
end;
$$;
revoke all on function public.paid_roster_snapshot(uuid, uuid) from public, anon, authenticated;
grant execute on function public.paid_roster_snapshot(uuid, uuid) to service_role;

create function public.apply_paid_roster_changes(p_course_id uuid, p_actor_id uuid, p_snapshot jsonb, p_changes jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_course public.courses%rowtype; v_job public.course_jobs%rowtype;
  v_version integer; v_job_id uuid; v_change jsonb;
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
  -- All operations are recomputed by the authenticated API, never taken from client values.
  for v_change in select value from jsonb_array_elements(p_changes) loop
    if not exists (select 1 from public.course_orders where course_id = p_course_id and id = (v_change->>'orderId')::uuid
      and regexp_replace(normalize(status, NFKC), '\s', '', 'g') = '결제완료') then
      raise exception '선택한 결제완료 주문을 확인해 주세요.';
    end if;
    if v_change->>'targetId' is not null and not exists (select 1 from public.job_enrollments
      where id = (v_change->>'targetId')::uuid and job_id = v_job.id and version = v_job.latest_version) then
      raise exception '변경할 수강생을 확인해 주세요.';
    end if;
    if exists (select 1 from jsonb_array_elements_text(v_change->'removeIds') r where not exists
      (select 1 from public.job_enrollments where id = r.value::uuid and job_id = v_job.id and version = v_job.latest_version)) then
      raise exception '중복 정리 대상을 확인해 주세요.';
    end if;
  end loop;
  if v_job.id is null then
    insert into public.course_jobs(workspace_id, course_id, name, default_course_name, status, latest_version, created_by, is_order_roster)
      values (v_course.workspace_id, p_course_id, v_course.name || ' 유료수강생', v_course.name, 'ready', 0, p_actor_id, true)
      returning * into v_job;
  end if;
  v_job_id := v_job.id; v_version := v_job.latest_version + 1;
  with operations as (
    select (c->>'orderId')::uuid order_id, (c->>'targetId')::uuid target_id, c->'removeIds' remove_ids
    from jsonb_array_elements(p_changes) c
  ), chosen as (
    select o.*, op.target_id, regexp_replace(regexp_replace(normalize(o.phone, NFKC), '[^0-9]', '', 'g'), '^(0082|82)', '') as digits
    from operations op join public.course_orders o on o.id = op.order_id and o.course_id = p_course_id
  ), mapped as (
    select *, case when digits like '10%' then '0' || digits else digits end as normalized_phone,
      jsonb_build_object('optionName', option_name, 'paymentAmount', payment_amount::text, 'orderRecordKey', record_key) as patch,
      jsonb_build_object('옵션명', option_name, '결제금액', payment_amount::text) as original_patch
    from chosen
  ), existing as (
    select * from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version
  ), combined as (
    select e.source_row_number as position, e.student_id, e.normalized_phone as phone,
      e.normalized_values || coalesce(m.patch, '{}'::jsonb) as vals,
      e.original_values || coalesce(m.original_patch, '{}'::jsonb) as original,
      e.is_extra_participant, e.is_manually_added
    from existing e left join mapped m on m.target_id = e.id
    where not exists (select 1 from operations op, jsonb_array_elements_text(op.remove_ids) r where r.value = e.id::text)
    union all
    select (select coalesce(max(source_row_number), 1) from existing) + row_number() over(order by m.record_key),
      null::uuid, m.normalized_phone,
      m.patch || jsonb_build_object('courseName', v_course.name, 'customerName', m.member_name,
        'phone', m.normalized_phone, 'email', m.email, 'referrer', m.rs, 'source', m.rs, 'adMedia', m.ad_media,
        'rs', m.rs, 'paymentMethod', m.payment_method, 'paymentId', m.payment_id, 'groupChatJoined', false, 'memo', ''),
      m.original_patch || jsonb_build_object('이름', m.member_name, '연락처', m.phone, '이메일', m.email,
        'RS', m.rs, '결제방법', m.payment_method, '결제ID', m.payment_id), false, false
    from mapped m where m.target_id is null
  )
  insert into public.job_enrollments(job_id, version, student_id, normalized_phone, normalized_values, original_values,
    source_row_number, is_duplicate, is_extra_participant, is_manually_added)
  select v_job.id, v_version, student_id, phone, vals, original, row_number() over(order by position) + 1,
    coalesce(phone, '') <> '' and count(*) over(partition by phone) > 1, is_extra_participant, is_manually_added
  from combined;
  update public.course_jobs set latest_version = v_version,
    valid_count = (select count(*) from public.job_enrollments where job_id = v_job.id and version = v_version),
    default_course_name = v_course.name, status = 'ready', updated_at = now() where id = v_job.id;
  insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
    values(v_course.workspace_id, p_actor_id, 'course_job.orders_reconciled', 'course_job', v_job.id,
      jsonb_build_object('version', v_version, 'changes', p_changes));
  return v_job_id;
end;
$$;
revoke all on function public.apply_paid_roster_changes(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_paid_roster_changes(uuid, uuid, jsonb, jsonb) to service_role;
