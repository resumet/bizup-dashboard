-- Paid rosters use the existing enrollment/message workflow, with one owned job per course.
alter table public.course_jobs add column is_order_roster boolean not null default false;
create unique index course_jobs_paid_course_idx on public.course_jobs(course_id) where is_order_roster;
create function public.check_paid_roster_workspace() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.is_order_roster and new.course_id is not null and not exists (
    select 1 from public.courses where id = new.course_id and workspace_id = new.workspace_id
  ) then raise exception '강의와 명단의 워크스페이스가 일치해야 합니다.'; end if;
  return new;
end;
$$;
create trigger check_paid_roster_workspace before insert or update of course_id, workspace_id, is_order_roster
  on public.course_jobs for each row execute function public.check_paid_roster_workspace();
create unique index job_enrollments_order_key_idx on public.job_enrollments
  (job_id, version, (normalized_values->>'orderRecordKey'))
  where normalized_values->>'orderRecordKey' is not null;

create function public.save_course_paid_roster(p_course_id uuid, p_actor_id uuid, p_order_ids uuid[])
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_course public.courses%rowtype;
  v_job public.course_jobs%rowtype;
  v_version integer;
  v_count integer;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then
    raise exception '유료수강생 명단을 관리할 권한이 없습니다.';
  end if;
  if p_order_ids is null or cardinality(p_order_ids) > 10000 then
    raise exception '한 번에 최대 10,000건을 저장할 수 있습니다.';
  end if;
  select count(*) into v_count from public.course_orders
    where course_id = p_course_id and id = any(p_order_ids)
      and regexp_replace(normalize(status, NFKC), '\s', '', 'g') = '결제완료';
  if v_count <> cardinality(p_order_ids) then
    raise exception '주문이 변경되었습니다. 주문내역을 새로고침한 뒤 명단을 다시 만들어 주세요.';
  end if;

  select * into v_job from public.course_jobs
    where course_id = p_course_id and is_order_roster for update;
  if v_job.id is null then
    insert into public.course_jobs(workspace_id, course_id, name, default_course_name, status, latest_version, created_by, is_order_roster)
      values (v_course.workspace_id, p_course_id, v_course.name || ' 유료수강생', v_course.name, 'ready', 0, p_actor_id, true)
      returning * into v_job;
  end if;
  -- Initializing an existing roster must never clear or version its contents.
  if cardinality(p_order_ids) = 0 and v_job.latest_version > 0 then return v_job.id; end if;
  v_version := v_job.latest_version + 1;

  with chosen as (
    select o.*, regexp_replace(normalize(o.phone, NFKC), '[^0-9]', '', 'g') as digits
    from public.course_orders o where o.course_id = p_course_id and o.id = any(p_order_ids)
  ), phones as (
    select *, regexp_replace(digits, '^(0082|82)', '') as local_phone from chosen
  ), incoming as (
    select *, case when local_phone like '10%' then '0' || local_phone else local_phone end as normalized_phone
    from phones
  ), mapped as (
    select record_key, normalized_phone, jsonb_build_object(
      'courseName', v_course.name, 'optionName', option_name, 'customerName', member_name,
      'phone', normalized_phone, 'email', email, 'referrer', rs, 'source', rs, 'adMedia', ad_media,
      'rs', rs, 'paymentMethod', payment_method, 'paymentId', payment_id, 'paymentAmount', payment_amount::text,
      'orderRecordKey', record_key
    ) as vals,
    jsonb_build_object('이름', member_name, '연락처', phone, '이메일', email, '옵션명', option_name,
      'RS', rs, '결제방법', payment_method, '결제ID', payment_id, '결제금액', payment_amount::text) as original
    from incoming
  ), existing as (
    select * from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version
  ), combined as (
    select e.source_row_number as position, e.student_id,
      coalesce(m.normalized_phone, e.normalized_phone) as phone,
      e.normalized_values || coalesce(m.vals, '{}'::jsonb) as vals,
      e.original_values || coalesce(m.original, '{}'::jsonb) as original,
      e.is_extra_participant, e.is_manually_added
    from existing e left join mapped m on m.record_key = e.normalized_values->>'orderRecordKey'
    union all
    select (select coalesce(max(source_row_number), 1) from existing) + row_number() over(order by m.record_key),
      null::uuid, m.normalized_phone, m.vals || '{"groupChatJoined":false,"memo":""}'::jsonb,
      m.original, false, false
    from mapped m where not exists (select 1 from existing e where e.normalized_values->>'orderRecordKey' = m.record_key)
  )
  insert into public.job_enrollments(job_id, version, student_id, normalized_phone, normalized_values, original_values,
    source_row_number, is_duplicate, is_extra_participant, is_manually_added)
  select v_job.id, v_version, student_id, phone, vals, original, row_number() over(order by position) + 1,
    coalesce(phone, '') <> '' and count(*) over(partition by phone) > 1, is_extra_participant, is_manually_added
  from combined;

  update public.course_jobs set latest_version = v_version,
    valid_count = (select count(*) from public.job_enrollments where job_id = v_job.id and version = v_version),
    default_course_name = v_course.name, status = 'ready', updated_at = now()
    where id = v_job.id;
  insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
    values(v_course.workspace_id, p_actor_id, 'course_job.orders_saved', 'course_job', v_job.id,
      jsonb_build_object('version', v_version, 'order_count', cardinality(p_order_ids)));
  return v_job.id;
end;
$$;
revoke all on function public.save_course_paid_roster(uuid, uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.save_course_paid_roster(uuid, uuid, uuid[]) to service_role;
