-- Save cost changes and invalidate derived settlement data in one transaction.
create or replace function public.save_course_cost_changes_and_reset_settlement(
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
  project public.course_settlement_projects%rowtype;
begin
  if not exists (
    select 1 from public.courses c
    join public.workspace_members m on m.workspace_id = c.workspace_id
    where c.id = p_course_id and m.user_id = p_actor_id
  ) then
    raise exception '비용을 관리할 권한이 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise exception '비용 변경 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(coalesce(p_changes->'creates', '[]'::jsonb))
    + jsonb_array_length(coalesce(p_changes->'updates', '[]'::jsonb))
    + jsonb_array_length(coalesce(p_changes->'deletes', '[]'::jsonb)) = 0 then
    return;
  end if;

  select * into project from public.course_settlement_projects
  where course_id = p_course_id for update;

  if found then
    delete from public.settlement_cost_snapshots where settlement_id = project.id;
    delete from public.course_settlement_versions where settlement_id = project.id;
    update public.course_settlement_projects
    set analysis_snapshot = null,
        statement_draft = '{}'::jsonb,
        status = '비용입력중',
        latest_version = latest_version + 1,
        updated_at = now()
    where id = project.id;

    insert into public.audit_logs (workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
    values (project.workspace_id, p_actor_id, 'course_settlement.reset_by_cost_change',
      'course_settlement', project.id, jsonb_build_object('previous_version', project.latest_version));
  end if;

  -- Any validation or optimistic-lock failure also rolls back the reset above.
  perform public.save_course_cost_changes(p_course_id, p_actor_id, p_changes);
end;
$$;

revoke all on function public.save_course_cost_changes_and_reset_settlement(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.save_course_cost_changes_and_reset_settlement(uuid, uuid, jsonb) to service_role;
notify pgrst, 'reload schema';
