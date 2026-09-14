create function hr.work_intervals(c jsonb,d date) returns int4multirange language plpgsql immutable as $$
declare spans int4multirange; b jsonb;
begin
  if not (c->'weekdays') @> to_jsonb(extract(isodow from d)::integer) or exists(select 1 from jsonb_array_elements(c->'holidays') h where h->>'date'=d::text) then return '{}'::int4multirange; end if;
  spans := int4multirange(int4range((c->>'start')::integer,(c->>'end')::integer,'[)'));
  for b in select * from jsonb_array_elements(c->'breaks') loop spans := spans-int4multirange(int4range((b->>0)::integer,(b->>1)::integer,'[)')); end loop;
  return spans;
end $$;
create function hr.remaining_intervals(org uuid,employee uuid,d date,policy_override uuid default null) returns int4multirange language plpgsql stable as $$
declare pol hr.policies; spans int4multirange; l hr.leave_days;
begin
  if policy_override is null then pol:=hr.policy(org,d); else select * into pol from hr.policies where id=policy_override and organization_id=org; end if;
  spans := hr.work_intervals(pol.config,d);
  for l in select * from hr.leave_days where employee_id=employee and day=d and active loop
    spans := spans-int4multirange(int4range(l.start_min,l.end_min,'[)'));
  end loop;
  return spans;
end $$;
create function hr.leave_preview(org uuid,start_day date,end_day date,unit text) returns jsonb language plpgsql stable as $$
declare d date; pol hr.policies; days jsonb:='[]'; excluded jsonb:='[]';
begin
  if start_day is null or end_day is null or unit is null or end_day<start_day or end_day-start_day>730 or unit not in ('full','am','pm') or (unit<>'full' and start_day<>end_day) then perform hr.fail('PT400','휴가 날짜와 단위를 확인해 주세요. 최대 2년 범위로 등록할 수 있습니다.'); end if;
  d:=start_day;
  while d<=end_day loop
    pol:=hr.policy(org,d);
    if hr.work_intervals(pol.config,d)='{}'::int4multirange then excluded:=excluded||to_jsonb(d::text);
    else
      if unit in ('full','am') then days:=days||jsonb_build_array(jsonb_build_object('day',d,'segment','am','start_min',pol.config->'start','end_min',pol.config->'split','policy_id',pol.id)); end if;
      if unit in ('full','pm') then days:=days||jsonb_build_array(jsonb_build_object('day',d,'segment','pm','start_min',pol.config->'split','end_min',pol.config->'end','policy_id',pol.id)); end if;
    end if;
    d:=d+1;
  end loop;
  return jsonb_build_object('days',days,'excluded',excluded,'units',jsonb_array_length(days)*0.5);
end $$;
create function hr.leave_expand(l hr.leaves) returns void language plpgsql as $$
declare preview jsonb;
begin
  preview:=hr.leave_preview(l.organization_id,l.start_date,l.end_date,l.unit);
  insert into hr.leave_days(leave_id,organization_id,employee_id,day,segment,start_min,end_min,policy_id,leave_version)
  select l.id,l.organization_id,l.employee_id,(x->>'day')::date,x->>'segment',(x->>'start_min')::integer,(x->>'end_min')::integer,(x->>'policy_id')::uuid,l.version
  from jsonb_array_elements(preview->'days') x;
end $$;
create function hr.attendance_conflicts(a hr.attendance,actor uuid) returns void language plpgsql as $$
declare l record;
begin
  for l in select distinct leave_id,leave_version from hr.leave_days d where d.employee_id=a.employee_id and d.active
    and tstzrange(a.check_in_at,coalesce(a.check_out_at,greatest(now(),a.check_in_at)+interval '1 microsecond'),'[)') && tstzrange(hr.at_day(d.day,d.start_min),hr.at_day(d.day,d.end_min),'[)') loop
    perform hr.emit(a.organization_id,'conflict:'||a.id||':'||a.version||':'||l.leave_id||':'||l.leave_version,'attendance.conflict',a.id,actor,
      hr.admins(a.organization_id)||a.employee_id,jsonb_build_object('employee_id',a.employee_id,'work_date',a.work_date),true);
  end loop;
end $$;
create function hr.attendance_command(e hr.employees,action text,p jsonb) returns jsonb language plpgsql as $$
declare a hr.attendance; pol hr.policies; d date:=hr.today();
begin
  if action='attendance.in' then
    perform hr.only_keys(p,'{}');
    select * into a from hr.attendance where employee_id=e.id and work_date=d;
    if a.id is not null then return to_jsonb(a); end if;
    if exists(select 1 from hr.attendance where employee_id=e.id and check_out_at is null) then perform hr.fail('PT409','이전 출근 기록이 열려 있습니다. 퇴근 또는 정정을 먼저 처리해 주세요.'); end if;
    if d<e.employment_start_date then perform hr.fail('PT400','입사일 이전에는 출근할 수 없습니다.'); end if;
    if exists(select 1 from hr.attendance where employee_id=e.id and check_out_at>now()) then perform hr.fail('PT409','기존 근태와 겹칩니다. 정정 기록을 확인해 주세요.'); end if;
    pol:=hr.policy(e.organization_id,d);
    insert into hr.attendance(organization_id,employee_id,work_date,check_in_at,policy_id) values(e.organization_id,e.id,d,now(),pol.id) returning * into a;
  elsif action='attendance.out' then
    perform hr.only_keys(p,array['id','expected_version']);
    select * into a from hr.attendance where employee_id=e.id and id=(p->>'id')::uuid for update;
    if a.id is null then perform hr.fail('PT404','본인의 출근 기록을 찾을 수 없습니다.'); end if;
    if a.check_out_at is not null then return to_jsonb(a); end if;
    perform hr.assert_version(a.version,p);
    if now()-a.check_in_at>interval '24 hours' then perform hr.fail('PT409','출근 후 24시간이 지났습니다. 근태 정정을 요청해 주세요.'); end if;
    if a.check_in_at>now() then perform hr.fail('PT409','출근 시각을 확인한 후 정정을 요청해 주세요.'); end if;
    update hr.attendance set check_out_at=now(),version=version+1 where id=a.id returning * into a;
  else perform hr.fail('PT400','지원하지 않는 근태 명령입니다.'); end if;
  perform hr.attendance_conflicts(a,e.id);
  return to_jsonb(a);
end $$;

create function hr.correction_command(e hr.employees,action text,p jsonb) returns jsonb language plpgsql as $$
declare c hr.corrections; a hr.attendance; old_a hr.attendance; target uuid; d date; clock_in timestamptz; clock_out timestamptz; reason text; pol hr.policies;
begin
  if action='correction.request' then
    perform hr.only_keys(p,array['work_date','check_in_at','check_out_at','reason']);
    target:=e.id; d:=(p->>'work_date')::date;
    clock_in:=(p->>'check_in_at')::timestamptz; clock_out:=(p->>'check_out_at')::timestamptz;
    if d is null or d>hr.today() or d<e.employment_start_date or clock_in is null or (clock_in at time zone 'Asia/Seoul')::date<>d or clock_in>now() or clock_out>now() or clock_out<clock_in then perform hr.fail('PT400','정정 대상 날짜와 시각을 확인해 주세요. 미래 시각은 입력할 수 없습니다.'); end if;
    select * into a from hr.attendance where employee_id=target and work_date=d;
    insert into hr.corrections(organization_id,employee_id,work_date,record_id,record_version,requested_in,requested_out,reason)
    values(e.organization_id,target,d,a.id,a.version,clock_in,clock_out,hr.text_value(p,'reason',1,2000)) returning * into c;
    perform hr.emit(e.organization_id,c.id||':requested','correction.request',c.id,e.id,hr.admins(e.organization_id));
    return to_jsonb(c);
  end if;
  if e.role<>'admin' then perform hr.fail('PT403','관리자만 근태 정정을 처리할 수 있습니다.'); end if;
  if action='correction.resolve' then
    perform hr.only_keys(p,array['id','decision','reason']);
    select * into c from hr.corrections where id=(p->>'id')::uuid and organization_id=e.organization_id for update;
    if c.id is null then perform hr.fail('PT404','정정 요청을 찾을 수 없습니다.'); end if;
    if c.status<>'pending' then perform hr.fail('PT409','이미 처리한 정정 요청입니다.'); end if;
    reason:=hr.text_value(p,'reason',1,2000);
    if p->>'decision' not in ('applied','rejected') or not p?'decision' then perform hr.fail('PT400','반영 또는 반려를 선택해 주세요.'); end if;
    if p->>'decision'='rejected' then
      update hr.corrections set status='rejected',reviewed_by=e.id,review_reason=hr.text_value(p,'reason',1,2000),reviewed_at=now() where id=c.id returning * into c;
      perform hr.log(e,'correction',c.id,'rejected',null,to_jsonb(c),reason);
      perform hr.emit(e.organization_id,c.id||':rejected','correction.result',c.id,e.id,array[c.employee_id],jsonb_build_object('status','rejected'),true);
      return to_jsonb(c);
    end if;
    target:=c.employee_id; d:=c.work_date; clock_in:=c.requested_in; clock_out:=c.requested_out;
  elsif action='correction.direct' then
    perform hr.only_keys(p,array['employee_id','work_date','check_in_at','check_out_at','expected_version','reason']);
    target:=(p->>'employee_id')::uuid; d:=(p->>'work_date')::date; clock_in:=(p->>'check_in_at')::timestamptz; clock_out:=(p->>'check_out_at')::timestamptz; reason:=hr.text_value(p,'reason',1,2000);
  else perform hr.fail('PT400','지원하지 않는 정정 명령입니다.'); end if;
  if not exists(select 1 from hr.employees where id=target and organization_id=e.organization_id and employment_start_date<=d and (employment_end_date is null or employment_end_date>=d)) then perform hr.fail('PT400','직원 재직 기간의 날짜를 선택해 주세요.'); end if;
  if d is null or d>hr.today() or clock_in is null or (clock_in at time zone 'Asia/Seoul')::date<>d or clock_in>now() or clock_out>now() or clock_out<clock_in then perform hr.fail('PT400','근태 시각의 날짜·순서를 확인해 주세요.'); end if;
  select * into a from hr.attendance where employee_id=target and work_date=d for update;
  old_a:=a;
  if action='correction.resolve' then
    if a.id is distinct from c.record_id or a.version is distinct from c.record_version then perform hr.fail('PT409','요청 후 근태가 변경되었습니다. 이 요청을 반려하고 최신 기록으로 다시 정정해 주세요.'); end if;
  else perform hr.assert_version(coalesce(a.version,0),p); end if;
  if exists(select 1 from hr.attendance x where x.employee_id=target and x.id is distinct from a.id and tstzrange(x.check_in_at,x.check_out_at,'[)') && tstzrange(clock_in,clock_out,'[)')) then perform hr.fail('PT409','다른 근태 기록과 시간이 겹칩니다.'); end if;
  if a.id is null then
    pol:=hr.policy(e.organization_id,d);
    insert into hr.attendance(organization_id,employee_id,work_date,check_in_at,check_out_at,policy_id,source) values(e.organization_id,target,d,clock_in,clock_out,pol.id,'correction') returning * into a;
  else
    update hr.attendance set check_in_at=clock_in,check_out_at=clock_out,version=version+1 where id=a.id returning * into a;
  end if;
  perform hr.log(e,'attendance',a.id,action,case when old_a.id is not null then to_jsonb(old_a) end,to_jsonb(a),reason);
  perform hr.attendance_conflicts(a,e.id);
  if c.id is not null then
    update hr.corrections set status='applied',reviewed_by=e.id,review_reason=hr.text_value(p,'reason',1,2000),reviewed_at=now() where id=c.id;
    perform hr.emit(e.organization_id,c.id||':applied','correction.result',c.id,e.id,array[target],jsonb_build_object('status','applied'),true);
  else perform hr.emit(e.organization_id,a.id||':corrected:'||a.version,'attendance.corrected',a.id,e.id,array[target],jsonb_build_object('work_date',d),true); end if;
  return to_jsonb(a);
end $$;

create function hr.leave_command(e hr.employees,action text,p jsonb) returns jsonb language plpgsql as $$
declare l hr.leaves; old_l hr.leaves; target uuid; preview jsonb; reason text; a hr.attendance;
begin
  if action='leave.create' then
    perform hr.only_keys(p,array['employee_id','start_date','end_date','unit','private_reason','admin_reason']);
    target:=coalesce((p->>'employee_id')::uuid,e.id);
    perform hr.employee_check(e.organization_id,array[target]);
    l.employee_id:=target; l.organization_id:=e.organization_id;
  else
    select * into l from hr.leaves where id=(p->>'id')::uuid and organization_id=e.organization_id for update;
    if l.id is null or (e.role<>'admin' and l.employee_id<>e.id) then perform hr.fail('PT404','휴가를 찾을 수 없습니다.'); end if;
    perform hr.assert_version(l.version,p);
    if l.status='cancelled' then perform hr.fail('PT409','취소된 휴가는 수정할 수 없습니다. 새로 등록해 주세요.'); end if;
    if e.role<>'admin' and exists(select 1 from hr.leave_days where leave_id=l.id and active and hr.at_day(day,start_min)<=now()) then perform hr.fail('PT403','이미 시작된 휴가는 관리자에게 변경·취소를 요청해 주세요.'); end if;
    old_l:=l;
  end if;
  if l.employee_id<>e.id and e.role<>'admin' then perform hr.fail('PT403','본인의 휴가만 등록할 수 있습니다.'); end if;
  reason:=hr.text_value(p,'admin_reason',case when l.employee_id<>e.id or coalesce((p->>'start_date')::date,l.start_date)<hr.today() then 1 else 0 end,2000);
  if action='leave.cancel' then
    perform hr.only_keys(p,array['id','expected_version','reason','admin_reason']);
    update hr.leaves set status='cancelled',cancelled_at=now(),cancellation_reason=hr.text_value(p,'reason',1,2000),updated_by=e.id,version=version+1,updated_at=now() where id=l.id returning * into l;
    update hr.leave_days set active=false where leave_id=l.id and active;
  else
    if action='leave.update' then perform hr.only_keys(p,array['id','expected_version','start_date','end_date','unit','private_reason','admin_reason']);
    elsif action<>'leave.create' then perform hr.fail('PT400','지원하지 않는 휴가 명령입니다.'); end if;
    l.start_date:=(p->>'start_date')::date; l.end_date:=(p->>'end_date')::date; l.unit:=p->>'unit';
    if l.start_date<hr.today() and e.role<>'admin' then perform hr.fail('PT403','과거 휴가는 관리자만 정정 등록할 수 있습니다.'); end if;
    preview:=hr.leave_preview(e.organization_id,l.start_date,l.end_date,l.unit);
    if (preview->>'units')::numeric=0 then perform hr.fail('PT400','적용할 근무일이 없습니다. 다른 날짜를 선택해 주세요.'); end if;
    if e.role<>'admin' and exists(select 1 from jsonb_array_elements(preview->'days') x where hr.at_day((x->>'day')::date,(x->>'start_min')::integer)<=now()) then perform hr.fail('PT403','이미 시작된 휴가 구간은 관리자에게 등록을 요청해 주세요.'); end if;
    if exists(select 1 from jsonb_array_elements(preview->'days') x join hr.leave_days ld on ld.employee_id=l.employee_id and ld.day=(x->>'day')::date and ld.segment=x->>'segment' and ld.active and ld.leave_id is distinct from l.id) then perform hr.fail('PT409','이미 등록된 휴가 구간과 겹칩니다.'); end if;
    if action='leave.create' then
      insert into hr.leaves(organization_id,employee_id,start_date,end_date,unit,private_reason,created_by,updated_by)
      values(e.organization_id,l.employee_id,l.start_date,l.end_date,l.unit,hr.text_value(p,'private_reason',0,2000),e.id,e.id) returning * into l;
    else
      update hr.leave_days set active=false where leave_id=l.id and active;
      update hr.leaves set start_date=l.start_date,end_date=l.end_date,unit=l.unit,private_reason=hr.text_value(p,'private_reason',0,2000),version=version+1,updated_by=e.id,updated_at=now() where id=l.id returning * into l;
    end if;
    perform hr.leave_expand(l);
    for a in select * from hr.attendance where employee_id=l.employee_id and work_date between l.start_date-1 and l.end_date loop perform hr.attendance_conflicts(a,e.id); end loop;
  end if;
  perform hr.log(e,'leave',l.id,action,case when old_l.id is not null then to_jsonb(old_l) end,to_jsonb(l),reason);
  perform hr.emit(e.organization_id,l.id||':'||l.version,action,l.id,e.id,hr.admins(e.organization_id)||case when l.employee_id<>e.id then array[l.employee_id] else '{}'::uuid[] end,
    jsonb_build_object('employee_name',(select name from hr.employees where id=l.employee_id),'start_date',l.start_date,'end_date',l.end_date,'unit',l.unit,'units',coalesce((select count(*)*0.5 from hr.leave_days where leave_id=l.id and active),0)),true);
  return to_jsonb(l);
end $$;
revoke all on all functions in schema hr from public,anon,authenticated;
