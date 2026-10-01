-- Legacy roster writers prepare N+1 before their compare-and-swap update and
-- clean that version up on failure. A reset must not activate their N+1 slot.
create or replace function public.reset_course_student_settlement_data(
  p_course_id uuid,
  p_actor_id uuid,
  p_target text,
  p_confirmation text
) returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_course public.courses%rowtype;
  v_job public.course_jobs%rowtype;
  v_count integer := 0;
  v_previous_version integer;
  v_version integer;
  v_result jsonb;
begin
  if p_target is null or p_target not in ('orders', 'paid-students') then
    raise exception '리셋할 항목이 올바르지 않습니다.' using errcode = '22023';
  end if;
  if p_confirmation is null or char_length(p_confirmation) > 200
    or char_length(btrim(p_confirmation)) = 0 then
    raise exception '확인용 강의명을 입력해 주세요.' using errcode = '22023';
  end if;

  -- Keep the same course -> paid job lock ordering as the existing import and
  -- reconciliation functions, including an empty roster with no rows to lock.
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null then
    raise exception '강의를 찾을 수 없습니다.' using errcode = 'P0002';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then
    raise exception '이 강의의 자료를 리셋할 권한이 없습니다.' using errcode = '42501';
  end if;
  if btrim(p_confirmation) is distinct from btrim(v_course.name) then
    raise exception '강의명이 일치하지 않습니다. 새로고침 후 현재 강의명을 정확히 입력해 주세요.';
  end if;

  if p_target = 'orders' then
    -- Upload history and the separately managed paid roster are preserved.
    delete from public.course_orders where course_id = v_course.id;
    get diagnostics v_count = row_count;
  else
    select * into v_job from public.course_jobs
    where course_id = v_course.id and workspace_id = v_course.workspace_id
      and is_order_roster
    for update;

    if v_job.id is not null then
      perform 1 from public.job_enrollments
      where job_id = v_job.id and version = v_job.latest_version for update;
      select count(*) into v_count from public.job_enrollments
      where job_id = v_job.id and version = v_job.latest_version;

      v_previous_version := v_job.latest_version;
      -- Skip both historical/prepared versions and the immediate next slot.
      -- A stale writer that read N before this lock can still insert into N+1
      -- and later delete N+1 after its CAS fails. Keep the new current roster
      -- above that slot so neither its inserts nor its cleanup can affect it.
      select greatest(
        v_job.latest_version,
        coalesce((select max(version) from public.job_enrollments where job_id = v_job.id), 0),
        coalesce((select max(version) from public.job_file_versions where job_id = v_job.id), 0)
      ) + 2 into v_version;
      update public.course_jobs
      set latest_version = v_version, valid_count = 0, error_count = 0,
        status = 'ready', updated_at = now()
      where id = v_job.id and course_id = v_course.id
        and workspace_id = v_course.workspace_id and is_order_roster;
    end if;
  end if;

  v_result := jsonb_build_object(
    'target', p_target, 'resetCount', v_count, 'jobId', v_job.id,
    'previousVersion', v_previous_version, 'version', v_version
  );
  -- Audit failure rolls back the reset too. No payment, settlement or cost
  -- records/flags are changed by this operation.
  insert into public.audit_logs(
    workspace_id, actor_id, event_type, entity_type, entity_id, metadata
  ) values (
    v_course.workspace_id, p_actor_id, 'course_operations.data_reset',
    'course', v_course.id, v_result
  );
  return v_result;
end;
$$;

revoke all on function public.reset_course_student_settlement_data(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.reset_course_student_settlement_data(uuid, uuid, text, text)
  to service_role;
