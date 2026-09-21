create or replace function public.reset_hr_leave_year(
  p_workspace_id uuid,
  p_actor_id uuid,
  p_year integer,
  p_is_admin boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  grant_count integer;
  request_count integer;
  support_count integer;
  year_start date;
  year_end date;
begin
  if not p_is_admin then
    raise exception 'ADMIN_REQUIRED';
  end if;
  if p_year < 2000 or p_year > 2100 then
    raise exception 'INVALID_YEAR';
  end if;
  if not exists (
    select 1
    from public.workspace_members member
    where member.workspace_id = p_workspace_id
      and member.user_id = p_actor_id
  ) then
    raise exception 'WORKSPACE_MEMBER_REQUIRED';
  end if;

  year_start := make_date(p_year, 1, 1);
  year_end := make_date(p_year, 12, 31);

  select count(*) into grant_count
  from public.hr_annual_leave_grants
  where workspace_id = p_workspace_id and grant_year = p_year;

  select count(*) into request_count
  from public.hr_leave_requests
  where workspace_id = p_workspace_id
    and leave_date between year_start and year_end;

  select count(*) into support_count
  from public.hr_leave_support_records
  where workspace_id = p_workspace_id
    and support_date between year_start and year_end;

  delete from public.hr_leave_requests
  where workspace_id = p_workspace_id
    and leave_date between year_start and year_end;

  delete from public.hr_leave_support_records
  where workspace_id = p_workspace_id
    and support_date between year_start and year_end;

  delete from public.hr_annual_leave_grants
  where workspace_id = p_workspace_id and grant_year = p_year;

  return jsonb_build_object(
    'year', p_year,
    'deletedGrants', grant_count,
    'deletedRequests', request_count,
    'deletedSupportRecords', support_count
  );
end;
$$;

revoke all on function public.reset_hr_leave_year(uuid, uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.reset_hr_leave_year(uuid, uuid, integer, boolean)
  to service_role;
