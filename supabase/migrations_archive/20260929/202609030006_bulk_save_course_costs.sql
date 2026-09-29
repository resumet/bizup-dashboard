create or replace function public.save_course_cost_changes(
  p_course_id uuid,
  p_actor_id uuid,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  item jsonb;
  existing_row public.course_costs%rowtype;
  saved_row public.course_costs%rowtype;
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id
  from public.courses c
  where c.id = p_course_id;

  if v_workspace_id is null or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = v_workspace_id and m.user_id = p_actor_id
  ) then
    raise exception '비용을 관리할 권한이 없습니다.';
  end if;

  if exists (
    select 1 from public.course_settlement_projects p
    where p.course_id = p_course_id and p.status = '정산확정'
  ) then
    raise exception '정산이 확정되어 비용을 변경할 수 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise exception '비용 변경 형식이 올바르지 않습니다.';
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'creates', '[]'::jsonb))
  loop
    insert into public.course_costs (
      course_id, category_code, name, burden_type, manager_user_id, manager_name,
      gross_amount, supply_amount, vat_amount, tax_type, paid_date, status,
      evidence_required, evidence_needs_review, evidence_types, other_evidence_type,
      company_share_rate, instructor_share_rate, company_share_amount, instructor_share_amount,
      include_in_settlement, note, created_by, updated_by
    ) values (
      p_course_id, item->>'category_code', item->>'name', item->>'burden_type',
      nullif(item->>'manager_user_id', '')::uuid, item->>'manager_name',
      (item->>'gross_amount')::bigint, (item->>'supply_amount')::bigint, (item->>'vat_amount')::bigint,
      'TAXABLE', nullif(item->>'paid_date', '')::date, item->>'status',
      false, false, '{}', '',
      (item->>'company_share_rate')::numeric, (item->>'instructor_share_rate')::numeric,
      (item->>'company_share_amount')::bigint, (item->>'instructor_share_amount')::bigint,
      true, '', p_actor_id, p_actor_id
    )
    returning * into saved_row;

    insert into public.course_cost_audit_logs (
      course_cost_id, course_id, actor_id, action, after_data
    ) values (saved_row.id, p_course_id, p_actor_id, 'CREATED', to_jsonb(saved_row));
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb))
  loop
    select * into existing_row
    from public.course_costs c
    where c.id = (item->>'id')::uuid
      and c.course_id = p_course_id
      and c.deleted_at is null
    for update;

    if not found then
      raise exception '수정할 비용을 찾을 수 없습니다.';
    end if;
    if existing_row.version <> (item->>'version')::integer then
      raise exception '다른 사용자가 비용을 수정했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    update public.course_costs c
    set category_code = item->>'category_code',
        name = item->>'name',
        burden_type = item->>'burden_type',
        manager_user_id = nullif(item->>'manager_user_id', '')::uuid,
        manager_name = item->>'manager_name',
        gross_amount = (item->>'gross_amount')::bigint,
        supply_amount = (item->>'supply_amount')::bigint,
        vat_amount = (item->>'vat_amount')::bigint,
        tax_type = 'TAXABLE',
        paid_date = nullif(item->>'paid_date', '')::date,
        status = item->>'status',
        evidence_required = false,
        evidence_needs_review = false,
        evidence_types = '{}',
        other_evidence_type = '',
        company_share_rate = (item->>'company_share_rate')::numeric,
        instructor_share_rate = (item->>'instructor_share_rate')::numeric,
        company_share_amount = (item->>'company_share_amount')::bigint,
        instructor_share_amount = (item->>'instructor_share_amount')::bigint,
        include_in_settlement = true,
        note = '',
        version = c.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    where c.id = existing_row.id
    returning * into saved_row;

    insert into public.course_cost_audit_logs (
      course_cost_id, course_id, actor_id, action, before_data, after_data
    ) values (
      saved_row.id, p_course_id, p_actor_id, 'UPDATED',
      to_jsonb(existing_row), to_jsonb(saved_row)
    );
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'deletes', '[]'::jsonb))
  loop
    select * into existing_row
    from public.course_costs c
    where c.id = (item->>'id')::uuid
      and c.course_id = p_course_id
      and c.deleted_at is null
    for update;

    if not found then
      raise exception '삭제할 비용을 찾을 수 없습니다.';
    end if;
    if existing_row.version <> (item->>'version')::integer then
      raise exception '다른 사용자가 비용을 수정했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    update public.course_costs c
    set deleted_at = now(),
        version = c.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    where c.id = existing_row.id
    returning * into saved_row;

    insert into public.course_cost_audit_logs (
      course_cost_id, course_id, actor_id, action, before_data, after_data
    ) values (
      saved_row.id, p_course_id, p_actor_id, 'DELETED',
      to_jsonb(existing_row), to_jsonb(saved_row)
    );
  end loop;
end;
$$;

revoke all on function public.save_course_cost_changes(uuid, uuid, jsonb) from public;
grant execute on function public.save_course_cost_changes(uuid, uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
