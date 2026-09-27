create or replace function public.course_wbs_employee_names(p_workspace_id uuid)
returns text[]
language sql stable security definer
set search_path = public, pg_temp
as $$
  select coalesce(array_agg(distinct btrim(employee.name) order by btrim(employee.name)), array[]::text[])
  from personnel_private.employees employee
  where employee.workspace_id = p_workspace_id
    and employee.status = 'employed'
    and btrim(employee.name) <> '';
$$;

revoke all on function public.course_wbs_employee_names(uuid) from public, anon, authenticated;
grant execute on function public.course_wbs_employee_names(uuid) to service_role;
