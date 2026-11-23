alter table public.course_document_settings
  add column instagram_assignee_id uuid references personnel_private.employees(id) on delete set null;
create index course_document_settings_instagram_assignee_idx
  on public.course_document_settings(instagram_assignee_id) where instagram_assignee_id is not null;

-- Only expose names and IDs from the private personnel schema to the workspace service.
create function public.instagram_employee_directory(p_workspace_id uuid)
returns table(id uuid, name text, active boolean)
language sql stable security definer set search_path = '' as $$
  select e.id, btrim(e.name), e.status = 'employed'
  from personnel_private.employees e
  where e.workspace_id = p_workspace_id and (e.status = 'employed' or exists (
    select 1 from public.course_document_settings s
    where s.workspace_id = e.workspace_id and s.instagram_assignee_id = e.id
  ))
  order by btrim(e.name), e.id;
$$;
revoke all on function public.instagram_employee_directory(uuid) from public, anon, authenticated;
grant execute on function public.instagram_employee_directory(uuid) to service_role;

create function public.save_instagram_settings(
  p_course_id uuid, p_workspace_id uuid, p_account_url text, p_total_count smallint,
  p_planning_completed_count smallint, p_filming_completed_count smallint,
  p_assignee_id uuid, p_set_assignee boolean
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform public.resize_instagram_progress(p_course_id, p_workspace_id, p_account_url, p_total_count,
    p_planning_completed_count, p_filming_completed_count);
  if p_set_assignee and not exists (
    select 1 from public.course_document_settings where course_id = p_course_id
    and workspace_id = p_workspace_id and instagram_assignee_id is not distinct from p_assignee_id
  ) then
    if p_assignee_id is not null and not exists (
      select 1 from public.instagram_employee_directory(p_workspace_id) where id = p_assignee_id and active
    ) then raise exception 'INVALID_INSTAGRAM_ASSIGNEE'; end if;
    update public.course_document_settings set instagram_assignee_id = p_assignee_id
      where course_id = p_course_id and workspace_id = p_workspace_id;
  end if;
  perform public.refresh_instagram_upload_schedule(p_course_id);
end;
$$;
revoke all on function public.save_instagram_settings(uuid,uuid,text,smallint,smallint,smallint,uuid,boolean) from public, anon, authenticated;
grant execute on function public.save_instagram_settings(uuid,uuid,text,smallint,smallint,smallint,uuid,boolean) to service_role;
