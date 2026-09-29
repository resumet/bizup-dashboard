create function hr.task_json(t hr.tasks) returns jsonb language sql stable as $$
  select to_jsonb(t)||jsonb_build_object('task_key','TASK-'||t.task_number,'assignee_name',(select name from hr.employees where id=t.assignee_id),
    'creator_name',(select name from hr.employees where id=t.creator_id),'watchers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from hr.employees where id=any(t.watcher_ids)),'[]'))
$$;

create function hr.attendance_summary(e hr.employees,d date) returns jsonb language plpgsql stable as $$
declare a hr.attendance; prior hr.attendance; pol hr.policies; spans int4multirange; r int4range; b jsonb; first_min integer; last_min integer;
  base text; late boolean:=false; conflict boolean:=false; dwell integer; reference_minutes integer; break_minutes numeric:=0; reviewed hr.reviews;
begin
  select * into a from hr.attendance where employee_id=e.id and work_date=d;
  if a.id is null then pol:=hr.policy(e.organization_id,d); else select * into pol from hr.policies where id=a.policy_id; end if;
  spans:=hr.remaining_intervals(e.organization_id,e.id,d,pol.id);
  select min(lower(x)),max(upper(x)) into first_min,last_min from unnest(spans) x;
  if d=hr.today() then select * into prior from hr.attendance where employee_id=e.id and work_date<d and check_out_at is null; end if;
  if prior.id is not null then base:='review_needed';
  elsif a.id is not null and a.check_out_at is null then base:='working';
  elsif a.id is not null then base:='checked_out';
  elsif hr.work_intervals(pol.config,d)='{}'::int4multirange then base:='off';
  elsif spans='{}'::int4multirange then base:='leave';
  elsif now()<hr.at_day(d,first_min) then base:='expected'; else base:='unchecked'; end if;
  late:=a.id is not null and first_min is not null and a.check_in_at>hr.at_day(d,first_min+coalesce((pol.config->>'grace')::integer,0));
  if a.check_out_at is not null then
    dwell:=floor(extract(epoch from (a.check_out_at-a.check_in_at))/60);
    for b in select * from jsonb_array_elements(pol.config->'breaks') loop
      break_minutes:=break_minutes+greatest(0,extract(epoch from (least(a.check_out_at,hr.at_day(d,(b->>1)::integer))-greatest(a.check_in_at,hr.at_day(d,(b->>0)::integer))))/60);
    end loop;
    reference_minutes:=greatest(0,floor(extract(epoch from (a.check_out_at-a.check_in_at))/60-break_minutes));
  end if;
  conflict:=a.id is not null and exists(select 1 from hr.leave_days l where l.employee_id=e.id and l.active and tstzrange(a.check_in_at,coalesce(a.check_out_at,greatest(now(),a.check_in_at)+interval '1 microsecond'),'[)') && tstzrange(hr.at_day(l.day,l.start_min),hr.at_day(l.day,l.end_min),'[)'));
  select * into reviewed from hr.reviews where employee_id=e.id and work_date=d;
  return jsonb_build_object('employee_id',e.id,'name',coalesce(a.employee_snapshot->>'name',hr.person_at(e,d)->>'name',e.name),'department',coalesce(a.employee_snapshot->>'department',hr.person_at(e,d)->>'department',e.department),'date',d,'base',base,'attendance',case when a.id is not null then to_jsonb(a) end,
    'prior_open',case when prior.id is not null then to_jsonb(prior) end,'late',late,'leave_conflict',conflict,
    'long_open',(a.id is not null and a.check_out_at is null and now()-a.check_in_at>interval '24 hours') or (prior.id is not null and now()-prior.check_in_at>interval '24 hours'),
    'dwell_minutes',dwell,'reference_minutes',reference_minutes,'review_version',coalesce(reviewed.latest_revision,0),
    'review_submitted_at',reviewed.submitted_at,'review_late',coalesce((select rr.late from hr.review_revisions rr where review_id=reviewed.id and revision=reviewed.latest_revision),false),
    'review_missing',a.id is not null and reviewed.id is null and (a.check_out_at is not null or now()>=hr.at_day(d,coalesce(last_min,(pol.config->>'end')::integer))),
    'pending_correction',exists(select 1 from hr.corrections where employee_id=e.id and work_date=d and status='pending'),
    'leave_segments',coalesce((select jsonb_agg(segment order by segment) from hr.leave_days where employee_id=e.id and day=d and active),'[]'),
    'expected_start',case when first_min is not null then hr.at_day(d,first_min) end,'expected_end',case when last_min is not null then hr.at_day(d,last_min) end,'policy',to_jsonb(pol));
end $$;

create function public.hr_query(p_resource text,p_filter jsonb default '{}') returns jsonb language plpgsql security definer set search_path=hr,pg_temp as $$
declare e hr.employees:=hr.me(); target hr.employees; detail_task hr.tasks; result jsonb; items jsonb; total bigint; d date:=coalesce((p_filter->>'date')::date,hr.today());
  start_day date:=coalesce((p_filter->>'from')::date,date_trunc('month',hr.today())::date); end_day date:=coalesce((p_filter->>'to')::date,(date_trunc('month',hr.today())+interval '1 month - 1 day')::date);
  page_size integer:=least(100,greatest(1,coalesce((p_filter->>'limit')::integer,50))); page_offset integer:=greatest(0,coalesce((p_filter->>'page')::integer,0))*least(100,greatest(1,coalesce((p_filter->>'limit')::integer,50)));
begin
  if end_day<start_day or end_day-start_day>731 then perform hr.fail('PT400','조회 기간은 최대 2년으로 선택해 주세요.'); end if;
  if p_resource='context' then
    return jsonb_build_object('me',to_jsonb(e),'organization',(select to_jsonb(o) from hr.organizations o where id=e.organization_id),'today',hr.today(),'now',now(),
      'unread',(select count(*) from hr.notifications where recipient_id=e.id and read_at is null));
  elsif p_resource='directory' then
    select coalesce(jsonb_agg(x),'[]') into items from (select id,name,department from hr.employees where organization_id=e.organization_id and active order by name limit page_size offset page_offset) x;
    return jsonb_build_object('items',items,'total',(select count(*) from hr.employees where organization_id=e.organization_id and active));
  elsif p_resource='today' then
    select coalesce(jsonb_agg(hr.task_json(x)||jsonb_build_object('transferred_today',exists(select 1 from hr.task_events ev where ev.task_id=x.id and ev.actor_id=e.id and ev.event_type='task.transfer' and ev.created_at>=hr.at_day(d,0) and ev.created_at<hr.at_day(d+1,0)))),'[]') into items from (select * from hr.today_tasks(e,d) limit page_size offset page_offset) x;
    return jsonb_build_object('summary',hr.attendance_summary(e,d),'tasks',items,'total',(select count(*) from hr.today_tasks(e,d)),
      'upcoming_leaves',coalesce((select jsonb_agg(to_jsonb(x)) from (select * from hr.leaves where employee_id=e.id and status='registered' and end_date>=d order by start_date limit 5) x),'[]'),'now',now(),'today',hr.today());
  elsif p_resource='tasks' then
    with allowed as (select t.* from hr.tasks t where hr.can_read(t,e)
      and (coalesce(p_filter->>'scope','all')='all' or (p_filter->>'scope'='assigned' and t.assignee_id=e.id) or (p_filter->>'scope'='created' and t.creator_id=e.id) or (p_filter->>'scope'='watching' and e.id=any(t.watcher_ids)))
      and (not p_filter?'assignee_id' or t.assignee_id=(p_filter->>'assignee_id')::uuid)
      and (not p_filter?'planned_date' or t.planned_date=(p_filter->>'planned_date')::date)
      and (coalesce(p_filter->>'status','open')='all' or (coalesce(p_filter->>'status','open')='open' and t.status in ('ready','doing')) or t.status=p_filter->>'status')
      and (coalesce(p_filter->>'q','')='' or t.title ilike '%'||(p_filter->>'q')||'%' or ('TASK-'||t.task_number) ilike '%'||(p_filter->>'q')||'%'))
    select jsonb_build_object('items',coalesce((select jsonb_agg(hr.task_json(x)) from (select * from allowed order by updated_at desc,id limit page_size offset page_offset) x),'[]'),'total',(select count(*) from allowed)) into result;
    return result;
  elsif p_resource='task' then
    select * into detail_task from hr.tasks where id=(p_filter->>'id')::uuid;
    if detail_task.id is null or not hr.can_read(detail_task,e) then perform hr.fail('PT404','업무를 찾을 수 없습니다.'); end if;
    return jsonb_build_object('task',hr.task_json(detail_task),
      'comments',coalesce((select jsonb_agg(x) from (select c.*,u.name as author_name from hr.comments c join hr.employees u on u.id=c.author_id where c.task_id=detail_task.id order by c.created_at desc,c.id limit page_size offset page_offset) x),'[]'),
      'comments_total',(select count(*) from hr.comments where task_id=detail_task.id),
      'events',coalesce((select jsonb_agg(x) from (select ev.*,u.name as actor_name from hr.task_events ev join hr.employees u on u.id=ev.actor_id where ev.task_id=detail_task.id order by ev.created_at desc,ev.id limit page_size offset page_offset) x),'[]'),
      'events_total',(select count(*) from hr.task_events where task_id=detail_task.id));
  elsif p_resource in ('records','leaves') then
    target:=e;
    if p_filter?'employee_id' and (p_filter->>'employee_id')::uuid<>e.id then
      if e.role<>'admin' then perform hr.fail('PT403','다른 직원의 기록을 조회할 수 없습니다.'); end if;
      select * into target from hr.employees where id=(p_filter->>'employee_id')::uuid and organization_id=e.organization_id;
      if target.id is null then perform hr.fail('PT404','직원을 찾을 수 없습니다.'); end if;
    end if;
    if p_resource='records' then
      start_day:=greatest(start_day,target.employment_start_date);
      end_day:=least(end_day,coalesce(target.employment_end_date,end_day));
      return jsonb_build_object('employee',jsonb_build_object('id',target.id,'name',target.name,'department',target.department),
        'days',coalesce((select jsonb_agg(hr.attendance_summary(target,x::date)) from (select generate_series(start_day::timestamp,end_day::timestamp,interval '1 day') as x limit page_size offset page_offset) days),'[]'),
        'total',greatest(0,end_day-start_day+1),
        'reviews',coalesce((select jsonb_agg(x) from (select r.work_date,r.latest_revision,rr.* from hr.reviews r join hr.review_revisions rr on rr.review_id=r.id where r.employee_id=target.id and r.work_date between start_day and end_day order by r.work_date desc,rr.revision desc limit page_size offset page_offset) x),'[]'),
        'reviews_total',(select count(*) from hr.reviews r join hr.review_revisions rr on rr.review_id=r.id where r.employee_id=target.id and r.work_date between start_day and end_day),
        'corrections',coalesce((select jsonb_agg(x) from (select * from hr.corrections where employee_id=target.id and work_date between start_day and end_day order by created_at desc limit page_size offset page_offset) x),'[]'),
        'corrections_total',(select count(*) from hr.corrections where employee_id=target.id and work_date between start_day and end_day),
        'audit_total',(select count(*) from hr.audit au join hr.attendance a on au.entity_type='attendance' and au.entity_id=a.id where a.employee_id=target.id and a.work_date between start_day and end_day),
        'audit',coalesce((select jsonb_agg(x) from (select au.* from hr.audit au join hr.attendance a on au.entity_type='attendance' and au.entity_id=a.id where a.employee_id=target.id and a.work_date between start_day and end_day order by au.created_at desc limit page_size offset page_offset) x),'[]'));
    end if;
    return jsonb_build_object('items',coalesce((select jsonb_agg(x) from (select * from hr.leaves where employee_id=target.id and start_date<=end_day and end_date>=start_day order by start_date desc,id limit page_size offset page_offset) x),'[]'),
      'total',(select count(*) from hr.leaves where employee_id=target.id and start_date<=end_day and end_date>=start_day),
      'used',(select count(*)*0.5 from hr.leave_days where employee_id=target.id and active and day between start_day and least(end_day,hr.today())),
      'planned',(select count(*)*0.5 from hr.leave_days where employee_id=target.id and active and day between greatest(start_day,hr.today()+1) and end_day));
  elsif p_resource='calendar' then
    select coalesce(jsonb_agg(x),'[]') into items from (select ld.id,ld.leave_id,ld.employee_id,ld.day,ld.segment,u.name,u.department,
      case when e.role='admin' or ld.employee_id=e.id then l.private_reason end as private_reason
      from hr.leave_days ld join hr.employees u on u.id=ld.employee_id join hr.leaves l on l.id=ld.leave_id
      where ld.organization_id=e.organization_id and ld.active and ld.day between start_day and end_day order by ld.day,u.name,ld.segment limit page_size offset page_offset) x;
    -- Remove the private field entirely from calendar responses for ordinary employees.
    if e.role<>'admin' then select coalesce(jsonb_agg(x-'private_reason'),'[]') into items from jsonb_array_elements(items) x; end if;
    return jsonb_build_object('items',items,'total',(select count(*) from hr.leave_days where organization_id=e.organization_id and active and day between start_day and end_day));
  elsif p_resource='leave.preview' then return hr.leave_preview(e.organization_id,(p_filter->>'start_date')::date,(p_filter->>'end_date')::date,p_filter->>'unit');
  elsif p_resource='notifications' then
    select coalesce(jsonb_agg(x),'[]') into items from (select n.id,n.event_type,n.read_at,n.created_at,
      case when n.event_type like 'task.%' and not exists(select 1 from hr.tasks t where t.id=n.entity_id and hr.can_read(t,e)) then null else n.entity_id end as entity_id,
      case when n.event_type like 'task.%' and not exists(select 1 from hr.tasks t where t.id=n.entity_id and hr.can_read(t,e)) then '{"unavailable":true}'::jsonb else n.payload end as payload
      from hr.notifications n where n.recipient_id=e.id order by n.created_at desc,n.id limit page_size offset page_offset) x;
    return jsonb_build_object('items',items,'total',(select count(*) from hr.notifications where recipient_id=e.id),'unread',(select count(*) from hr.notifications where recipient_id=e.id and read_at is null));
  end if;
  if e.role<>'admin' then perform hr.fail('PT403','관리자만 조회할 수 있습니다.'); end if;
  if p_resource='employees' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x) from (select * from hr.employees where organization_id=e.organization_id order by active desc,name,id limit page_size offset page_offset) x),'[]'),
      'total',(select count(*) from hr.employees where organization_id=e.organization_id),
      'invitations_total',(select count(*) from hr.invitations where organization_id=e.organization_id),
      'invitations',coalesce((select jsonb_agg(x) from (select * from hr.invitations where organization_id=e.organization_id order by created_at desc limit page_size offset page_offset) x),'[]'));
  elsif p_resource='policies' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x) from (select * from hr.policies where organization_id=e.organization_id order by version desc limit page_size offset page_offset) x),'[]'));
  elsif p_resource='admin' then
    with people as (select u.* from hr.employees u where u.organization_id=e.organization_id and u.employment_start_date<=d and (u.employment_end_date is null or u.employment_end_date>=d)
      and (coalesce(p_filter->>'department','')='' or hr.person_at(u,d)->>'department'=p_filter->>'department') and (coalesce(p_filter->>'q','')='' or hr.person_at(u,d)->>'name' ilike '%'||(p_filter->>'q')||'%')),
    current_counts as (select assignee_id,jsonb_object_agg(status,n) counts from (
      select assignee_id,status,count(*) n from hr.tasks where organization_id=e.organization_id group by assignee_id,status
    ) counted group by assignee_id),
    daily_candidates as (
      select u.id employee_id,t.id task_id from people u join hr.tasks t on t.assignee_id=u.id and t.organization_id=e.organization_id
        where (t.planned_date<=d and t.status in ('ready','doing')) or t.planned_date=d
      union
      select u.id,ev.task_id from people u join hr.task_events ev on ev.actor_id=u.id join hr.tasks t on t.id=ev.task_id
        where ev.created_at>=hr.at_day(d,0) and ev.created_at<hr.at_day(d+1,0) and hr.can_read(t,u)
    ),
    daily_counts as (select employee_id,jsonb_object_agg(status,n) counts from (
      select selected.employee_id,t.status,count(*) n from daily_candidates selected join hr.tasks t on t.id=selected.task_id group by selected.employee_id,t.status
    ) counted group by employee_id),
    activities as (select ev.actor_id,count(*) total,count(*) filter(where ev.event_type='task.transfer') transfers
      from hr.task_events ev join people u on u.id=ev.actor_id where ev.created_at>=hr.at_day(d,0) and ev.created_at<hr.at_day(d+1,0) group by ev.actor_id),
    rows as (select hr.attendance_summary(u,d)||jsonb_build_object('task_counts',current_counts.counts,'today_task_counts',daily_counts.counts,
      'today_activity',coalesce(activities.total,0),'today_transfers',coalesce(activities.transfers,0)) as row from people u
      left join current_counts on current_counts.assignee_id=u.id left join daily_counts on daily_counts.employee_id=u.id left join activities on activities.actor_id=u.id),
    filtered as (select row from rows where (coalesce(p_filter->>'base','')='' or row->>'base'=p_filter->>'base') and (coalesce(p_filter->>'needs_attention','false')<>'true' or (row->>'long_open')::boolean or (row->>'pending_correction')::boolean or (row->>'leave_conflict')::boolean or row->>'base'='review_needed')
      and (coalesce(p_filter->>'review_missing','false')<>'true' or (row->>'review_missing')::boolean))
    select jsonb_build_object('items',coalesce((select jsonb_agg(row) from (select row from filtered order by row->>'name',row->>'employee_id' limit page_size offset page_offset) x),'[]'),
      'total',(select count(*) from filtered),'people_total',(select count(*) from people),'counts',(select jsonb_object_agg(base,n) from (select row->>'base' base,count(*) n from rows group by row->>'base') c),'now',now(),'date',d) into result;
    return result;
  elsif p_resource='outbox' then
    return jsonb_build_object('items',coalesce((select jsonb_agg(x) from (select id,event_type,attempts,next_retry_at,last_error,created_at from hr.outbox where organization_id=e.organization_id and processed_at is null order by created_at limit page_size offset page_offset) x),'[]'));
  end if;
  perform hr.fail('PT400','지원하지 않는 조회입니다.'); return null;
end $$;

create function public.hr_command(p_action text,p_body jsonb,p_key uuid) returns jsonb language plpgsql security definer set search_path=hr,pg_temp as $$
declare e hr.employees; previous hr.commands; result jsonb;
begin
  e:=hr.me();
  -- Organization mutex orders all domain changes, including role/deactivation races.
  perform 1 from hr.organizations where id=e.organization_id for update;
  e:=hr.me();
  if p_key is null then perform hr.fail('PT400','요청 식별자가 필요합니다.'); end if;
  select * into previous from hr.commands where employee_id=e.id and request_key=p_key;
  if previous.employee_id is not null then
    if (p_action like 'policy.%' or p_action like 'employee.%' or p_action like 'invitation.%' or p_action in ('correction.resolve','correction.direct')) and e.role<>'admin' then perform hr.fail('PT403','관리자 권한이 필요합니다.'); end if;
    if p_action like 'leave.%' and e.role<>'admin' and previous.result->>'employee_id' is distinct from e.id::text then perform hr.fail('PT404','휴가를 찾을 수 없습니다.'); end if;
    if previous.command<>p_action or previous.body<>p_body then perform hr.fail('PT409','같은 요청 식별자로 다른 내용을 저장할 수 없습니다.'); end if;
    -- Recheck entity access for replayed task results after reassignment/removal.
    if p_action like 'task.%' and p_action<>'task.comment' and not exists(select 1 from hr.tasks t where t.id=(previous.result->>'id')::uuid and hr.can_read(t,e)) then perform hr.fail('PT404','업무를 찾을 수 없습니다.'); end if;
    return previous.result;
  end if;
  if p_action like 'task.%' then result:=hr.task_command(e,p_action,p_body);
  elsif p_action in ('attendance.in','attendance.out') then result:=hr.attendance_command(e,p_action,p_body);
  elsif p_action in ('correction.request','correction.resolve','correction.direct') then result:=hr.correction_command(e,p_action,p_body);
  elsif p_action in ('leave.create','leave.update','leave.cancel') then result:=hr.leave_command(e,p_action,p_body);
  elsif p_action='review.submit' then result:=hr.review_command(e,p_body);
  elsif p_action in ('policy.preview','policy.save') then result:=hr.policy_command(e,p_action,p_body);
  elsif p_action='employee.update' then result:=hr.employee_command(e,p_body);
  elsif p_action='invitation.reserve' then result:=hr.invitation_command(e,p_body);
  elsif p_action in ('invitation.retry','invitation.inspect') then
    if e.role<>'admin' then perform hr.fail('PT403','관리자만 초대를 처리할 수 있습니다.'); end if;
    if p_action='invitation.retry' then
      update hr.invitations set status='pending' where id=(p_body->>'id')::uuid and organization_id=e.organization_id and status in ('failed','pending');
      if not found then perform hr.fail('PT409','전송 실패가 확인된 초대만 재시도할 수 있습니다.'); end if;
    end if;
    select to_jsonb(i) into result from hr.invitations i where id=(p_body->>'id')::uuid and organization_id=e.organization_id;
    if result is null then perform hr.fail('PT404','초대 기록이 없습니다.'); end if;
  elsif p_action='notification.read' then
    update hr.notifications set read_at=coalesce(read_at,now()) where recipient_id=e.id and id=(p_body->>'id')::uuid;
    if not found then perform hr.fail('PT404','알림을 찾을 수 없습니다.'); end if;
    result:='{"ok":true}';
  else perform hr.fail('PT400','지원하지 않는 명령입니다.'); end if;
  insert into hr.commands(employee_id,request_key,command,body,result) values(e.id,p_key,p_action,p_body,result);
  return result;
exception when unique_violation then perform hr.fail('PT409','이미 처리했거나 다른 기록과 중복됩니다. 최신 목록을 확인해 주세요.');
  when invalid_text_representation or datetime_field_overflow or not_null_violation or check_violation then perform hr.fail('PT400','입력 값의 형식·날짜·필수 항목을 확인해 주세요.');
end $$;

create function public.hr_process_notifications(p_limit integer default 100) returns jsonb language plpgsql security definer set search_path=hr,pg_temp as $$
declare event hr.outbox; recipient uuid; delivered integer:=0; failures integer:=0;
begin
  for event in select * from hr.outbox where processed_at is null and next_retry_at<=now() order by created_at limit least(greatest(p_limit,1),500) for update skip locked loop
    begin
      foreach recipient in array event.recipients loop
        if exists(select 1 from hr.employees where id=recipient and organization_id=event.organization_id and active) then
          insert into hr.notifications(organization_id,event_id,recipient_id,event_type,entity_id,payload,read_at)
          values(event.organization_id,event.id,recipient,event.event_type,event.entity_id,event.payload,case when recipient=event.actor_id then now() end) on conflict(event_id,recipient_id) do nothing;
        end if;
      end loop;
      update hr.outbox set processed_at=now(),attempts=attempts+1,last_error=null where id=event.id;
      delivered:=delivered+1;
    exception when others then
      update hr.outbox set attempts=attempts+1,next_retry_at=now()+make_interval(secs=>least(3600,30*power(2,least(attempts,7)))),last_error=sqlstate where id=event.id;
      failures:=failures+1;
    end;
  end loop;
  return jsonb_build_object('processed',delivered,'failed',failures);
end $$;

create function public.hr_generate_reminders() returns integer language plpgsql security definer set search_path=hr,pg_temp as $$
declare a hr.attendance; e hr.employees; spans int4multirange; finish integer; made integer:=0; pol hr.policies;
begin
  for a in select * from hr.attendance where work_date=hr.today() and check_out_at is null loop
    select * into e from hr.employees where id=a.employee_id and active;
    if e.id is null then continue; end if;
    select * into pol from hr.policies where id=a.policy_id;
    spans:=hr.remaining_intervals(a.organization_id,a.employee_id,a.work_date,a.policy_id);
    select max(upper(x)) into finish from unnest(spans) x;
    if finish is not null and now()>=hr.at_day(a.work_date,finish-30) and now()<hr.at_day(a.work_date,finish)
      and not exists(select 1 from hr.reviews where employee_id=e.id and work_date=a.work_date) then
      perform hr.emit(a.organization_id,'reminder:'||e.id||':'||a.work_date,'review.reminder',a.id,null,array[e.id],jsonb_build_object('work_date',a.work_date));
      made:=made+1;
    end if;
  end loop;
  return made;
end $$;

revoke all on function public.hr_query(text,jsonb),public.hr_command(text,jsonb,uuid) from public,anon;
grant execute on function public.hr_query(text,jsonb),public.hr_command(text,jsonb,uuid) to authenticated;
revoke all on function public.hr_process_notifications(integer),public.hr_generate_reminders() from public,anon,authenticated;
grant execute on function public.hr_process_notifications(integer),public.hr_generate_reminders() to service_role;
revoke all on all functions in schema hr from public,anon,authenticated;
