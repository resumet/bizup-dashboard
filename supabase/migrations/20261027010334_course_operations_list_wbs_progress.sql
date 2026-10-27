create or replace function public.course_operations_list_wbs_progress(
  p_workspace_id uuid,
  p_today date
)
returns table (
  course_id uuid,
  total_item_count bigint,
  overdue_item_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    wbs.course_id,
    count(*)::bigint as total_item_count,
    count(*) filter (
      where coalesce(item.value ->> 'completed', 'false') <> 'true'
        and coalesce(
          nullif(item.value ->> 'dueDate', ''),
          nullif(item.value ->> 'startDate', '')
        ) ~ '^\d{4}-\d{2}-\d{2}$'
        and coalesce(
          nullif(item.value ->> 'dueDate', ''),
          nullif(item.value ->> 'startDate', '')
        ) < to_char(p_today, 'YYYY-MM-DD')
    )::bigint as overdue_item_count
  from public.course_wbs as wbs
  cross join lateral jsonb_array_elements(wbs.items) as item(value)
  where wbs.workspace_id = p_workspace_id
  group by wbs.course_id;
$$;

revoke all on function public.course_operations_list_wbs_progress(uuid, date)
  from public, anon, authenticated;
grant execute on function public.course_operations_list_wbs_progress(uuid, date)
  to service_role;

comment on function public.course_operations_list_wbs_progress(uuid, date) is
  '강의 운영 목록에 표시할 강의별 WBS 전체 항목 수와 미완료 기한 초과 수를 집계한다.';
