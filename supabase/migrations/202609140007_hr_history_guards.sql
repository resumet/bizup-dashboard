alter table hr.attendance add column employee_snapshot jsonb not null default '{}';
create function hr.snapshot_attendance() returns trigger language plpgsql set search_path=hr,pg_temp as $$
begin
  new.employee_snapshot := (select jsonb_build_object('name',name,'department',department) from hr.employees where id=new.employee_id);
  return new;
end $$;
create trigger hr_attendance_employee_snapshot before insert on hr.attendance for each row execute function hr.snapshot_attendance();
create function hr.snapshot_task_event() returns trigger language plpgsql set search_path=hr,pg_temp as $$
declare obj jsonb; enriched jsonb; n integer;
begin
  for n in 1..2 loop
    obj:=case when n=1 then new.before_data else new.after_data end;
    if obj is not null then
      enriched:=obj||jsonb_build_object('assignee_snapshot',(select jsonb_build_object('id',id,'name',name,'department',department) from hr.employees where id=(obj->>'assignee_id')::uuid),
        'watcher_snapshots',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name,'department',department)) from hr.employees where id in(select value::uuid from jsonb_array_elements_text(obj->'watcher_ids'))),'[]'));
      if n=1 then new.before_data:=enriched; else new.after_data:=enriched; end if;
    end if;
  end loop;
  return new;
end $$;
create trigger hr_task_event_names before insert on hr.task_events for each row execute function hr.snapshot_task_event();
create function hr.person_at(e hr.employees,d date) returns jsonb language sql stable as $$
  select coalesce((select before_data from hr.audit where entity_type='employee' and entity_id=e.id and action='employee.update' and created_at>=hr.at_day(d+1,0) order by created_at limit 1),to_jsonb(e))
$$;
create function hr.guard_employee_dates() returns trigger language plpgsql set search_path=hr,pg_temp as $$
begin
  if new.employment_end_date is not null and exists(select 1 from hr.attendance where employee_id=new.id and work_date>new.employment_end_date) then perform hr.fail('PT400','퇴사일 이후에 근태 기록이 있습니다. 기존 기록을 확인해 주세요.'); end if;
  return new;
end $$;
create trigger hr_employee_date_guard before update on hr.employees for each row execute function hr.guard_employee_dates();
revoke all on all functions in schema hr from public,anon,authenticated;
