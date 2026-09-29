create function hr.validate_policy(c jsonb) returns void language plpgsql immutable as $$
declare start_m integer:=(c->>'start')::integer; end_m integer:=(c->>'end')::integer; split_m integer:=(c->>'split')::integer;
  spans int4multirange; breaks int4multirange:='{}'; b jsonb; r int4range; am integer; pm integer;
begin
  perform hr.only_keys(c,array['weekdays','start','end','breaks','split','grace','holidays']);
  if exists(select 1 from unnest(array['start','end','split','grace']) field where jsonb_typeof(c->field) is distinct from 'number') then perform hr.fail('PT400','근무 시각은 분 단위 숫자로 입력해 주세요.'); end if;
  if start_m is null or end_m is null or split_m is null or start_m<0 or end_m>1440 or start_m>=split_m or split_m>=end_m
    or (c->>'grace')::integer is null or (c->>'grace')::integer not between 0 and 120
    or jsonb_typeof(c->'weekdays') is distinct from 'array' or jsonb_array_length(c->'weekdays') not between 1 and 7
    or jsonb_typeof(c->'breaks') is distinct from 'array' or jsonb_typeof(c->'holidays') is distinct from 'array' then perform hr.fail('PT400','근무 요일·시간·휴게·반차 기준을 확인해 주세요.'); end if;
  if exists(select 1 from jsonb_array_elements(c->'weekdays') x where jsonb_typeof(x)<>'number') or exists(select 1 from jsonb_array_elements_text(c->'weekdays') x where x::integer not between 1 and 7)
    or (select count(*)<>count(distinct x) from jsonb_array_elements_text(c->'weekdays') x) then perform hr.fail('PT400','근무 요일은 중복 없이 1~7로 지정해 주세요.'); end if;
  for b in select * from jsonb_array_elements(c->'breaks') loop
    if jsonb_typeof(b)<>'array' or jsonb_array_length(b)<>2 or jsonb_typeof(b->0) is distinct from 'number' or jsonb_typeof(b->1) is distinct from 'number' or (b->>0)::integer<start_m or (b->>1)::integer>end_m or (b->>0)::integer>=(b->>1)::integer then perform hr.fail('PT400','휴게시간은 근무 구간 안에서 시작·종료 순서로 입력해 주세요.'); end if;
    r:=int4range((b->>0)::integer,(b->>1)::integer,'[)');
    if breaks && int4multirange(r) then perform hr.fail('PT400','휴게시간이 서로 겹칩니다.'); end if;
    breaks:=breaks+int4multirange(r);
  end loop;
  spans:=int4multirange(int4range(start_m,end_m,'[)'))-breaks;
  select coalesce(sum(upper(x)-lower(x)),0) into am from unnest(spans*int4multirange(int4range(start_m,split_m,'[)'))) x;
  select coalesce(sum(upper(x)-lower(x)),0) into pm from unnest(spans*int4multirange(int4range(split_m,end_m,'[)'))) x;
  if am<=0 or am<>pm then perform hr.fail('PT400','오전·오후 반차는 휴게를 제외한 근무시간을 절반씩 나누어야 합니다.'); end if;
  if exists(select 1 from jsonb_array_elements(c->'holidays') h where (h->>'date')::date is null or length(btrim(h->>'name')) not between 1 and 100)
    or (select count(*)<>count(distinct h->>'date') from jsonb_array_elements(c->'holidays') h) then perform hr.fail('PT400','휴무일의 날짜·이름·중복을 확인해 주세요.'); end if;
end $$;

create function hr.policy_command(e hr.employees,action text,p jsonb) returns jsonb language plpgsql as $$
declare pol hr.policies; old_pol hr.policies; l hr.leaves; before_days jsonb; after_days jsonb; impact jsonb:='[]'; affected uuid[]:='{}'; date_from date;
begin
  if e.role<>'admin' then perform hr.fail('PT403','관리자만 근무정책을 관리할 수 있습니다.'); end if;
  perform hr.only_keys(p,array['effective_from','config','expected_version','confirm_impact']);
  perform hr.validate_policy(p->'config');
  date_from:=(p->>'effective_from')::date;
  if date_from is null or date_from<=hr.today() then perform hr.fail('PT400','새 정책은 내일 이후에 적용할 수 있습니다.'); end if;
  select * into old_pol from hr.policies where organization_id=e.organization_id order by version desc limit 1;
  perform hr.assert_version(old_pol.version,p);
  -- Future effective dates may receive another immutable revision. Existing attendance keeps its policy_id.
  if exists(select 1 from jsonb_array_elements(p->'config'->'holidays') h where (h->>'date')::date<date_from and not old_pol.config->'holidays' @> jsonb_build_array(h))
    or exists(select 1 from jsonb_array_elements(old_pol.config->'holidays') h where (h->>'date')::date<date_from and not p->'config'->'holidays' @> jsonb_build_array(h)) then perform hr.fail('PT400','정책 적용일 이전의 휴무일은 변경할 수 없습니다.'); end if;
  insert into hr.policies(organization_id,effective_from,version,config,created_by) values(e.organization_id,date_from,old_pol.version+1,p->'config',e.id) returning * into pol;
  for l in select * from hr.leaves where organization_id=e.organization_id and status='registered' and end_date>=date_from order by id loop
    select coalesce(jsonb_agg(jsonb_build_object('day',day,'segment',segment,'start_min',start_min,'end_min',end_min) order by day,segment),'[]') into before_days from hr.leave_days where leave_id=l.id and active and day>=date_from;
    select coalesce(jsonb_agg(x-'policy_id' order by x->>'day',x->>'segment'),'[]') into after_days from jsonb_array_elements(hr.leave_preview(e.organization_id,l.start_date,l.end_date,l.unit)->'days') x where (x->>'day')::date>=date_from;
    if before_days is distinct from after_days then
      impact:=impact||jsonb_build_array(jsonb_build_object('leave_id',l.id,'employee_id',l.employee_id,'employee_name',(select name from hr.employees where id=l.employee_id),'before',before_days,'after',after_days,'before_units',jsonb_array_length(before_days)*0.5,'after_units',jsonb_array_length(after_days)*0.5));
      affected:=affected||l.employee_id;
      if action='policy.save' then
        update hr.leave_days set active=false where leave_id=l.id and active and day>=date_from;
        update hr.leaves set version=version+1,updated_at=now(),updated_by=e.id where id=l.id returning * into l;
        insert into hr.leave_days(leave_id,organization_id,employee_id,day,segment,start_min,end_min,policy_id,leave_version)
        select l.id,l.organization_id,l.employee_id,(x->>'day')::date,x->>'segment',(x->>'start_min')::integer,(x->>'end_min')::integer,(hr.policy(e.organization_id,(x->>'day')::date)).id,l.version
        from jsonb_array_elements(after_days) x;
        perform hr.log(e,'leave',l.id,'policy.recalculated',before_days,after_days,'근무정책 변경');
      end if;
    end if;
  end loop;
  if action='policy.preview' then
    delete from hr.policies where id=pol.id;
    return jsonb_build_object('impact',impact,'policy_version',old_pol.version);
  end if;
  if p->'confirm_impact' is distinct from impact then perform hr.fail('PT409','영향받는 휴가가 바뀌었습니다. 정책 영향 미리보기를 다시 확인해 주세요.'); end if;
  perform hr.log(e,'policy',pol.id,'policy.save',to_jsonb(old_pol),to_jsonb(pol));
  perform hr.emit(e.organization_id,pol.id||':policy','policy.changed',pol.id,e.id,hr.admins(e.organization_id)||affected,jsonb_build_object('effective_from',date_from),true);
  return jsonb_build_object('policy',to_jsonb(pol),'impact',impact);
end $$;

create function hr.employee_command(e hr.employees,p jsonb) returns jsonb language plpgsql as $$
declare target hr.employees; old_e hr.employees; active_admins integer; change_role text; change_active boolean;
begin
  if e.role<>'admin' then perform hr.fail('PT403','관리자만 직원을 관리할 수 있습니다.'); end if;
  perform hr.only_keys(p,array['id','expected_version','name','department','role','active','employment_start_date','employment_end_date','reason']);
  select * into target from hr.employees where organization_id=e.organization_id and id=(p->>'id')::uuid for update;
  if target.id is null then perform hr.fail('PT404','직원을 찾을 수 없습니다.'); end if;
  perform hr.assert_version(target.version,p); old_e:=target;
  change_role:=coalesce(p->>'role',target.role); change_active:=coalesce((p->>'active')::boolean,target.active);
  if change_role not in ('admin','employee') then perform hr.fail('PT400','직원 역할을 확인해 주세요.'); end if;
  if target.role='admin' and target.active and (change_role<>'admin' or not change_active) and (select count(*) from hr.employees where organization_id=e.organization_id and role='admin' and active)<=1 then perform hr.fail('PT409','마지막 활성 관리자는 비활성화하거나 강등할 수 없습니다.'); end if;
  if not change_active and exists(select 1 from hr.tasks where assignee_id=target.id and status in ('ready','doing')) then perform hr.fail('PT409','미완료 담당 업무를 먼저 다른 활성 직원에게 이관해 주세요.'); end if;
  if not change_active and exists(select 1 from hr.attendance where employee_id=target.id and check_out_at is null) then perform hr.fail('PT409','열린 출근 기록을 먼저 퇴근 또는 정정 처리해 주세요.'); end if;
  if (p->>'employment_start_date')::date>(select min(work_date) from hr.attendance where employee_id=target.id) then perform hr.fail('PT400','기존 근태 이후로 입사일을 바꿀 수 없습니다.'); end if;
  update hr.employees set name=case when p?'name' then hr.text_value(p,'name',1,100) else name end,
    department=case when p?'department' then hr.text_value(p,'department',0,100) else department end,
    role=change_role,active=change_active,employment_start_date=coalesce((p->>'employment_start_date')::date,employment_start_date),
    employment_end_date=case when change_active then null else coalesce((p->>'employment_end_date')::date,hr.today()) end,
    deactivated_at=case when change_active then null else coalesce(deactivated_at,now()) end,version=version+1 where id=target.id returning * into target;
  perform hr.log(e,'employee',target.id,'employee.update',to_jsonb(old_e),to_jsonb(target),hr.text_value(p,'reason',1,2000));
  return to_jsonb(target);
end $$;

create function hr.invitation_command(e hr.employees,p jsonb) returns jsonb language plpgsql as $$
declare invitation hr.invitations; address text:=lower(hr.text_value(p,'email',3,254));
begin
  if e.role<>'admin' then perform hr.fail('PT403','관리자만 직원을 초대할 수 있습니다.'); end if;
  perform hr.only_keys(p,array['email','name','department','role','employment_start_date']);
  if address !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or p->>'role' not in ('employee','admin') or not p?'employment_start_date' then perform hr.fail('PT400','이메일·역할·입사일을 확인해 주세요.'); end if;
  if exists(select 1 from hr.employees where organization_id=e.organization_id and email=address) then perform hr.fail('PT409','이미 등록된 직원입니다.'); end if;
  insert into hr.invitations(organization_id,email,name,department,role,employment_start_date,invited_by)
  values(e.organization_id,address,hr.text_value(p,'name',1,100),hr.text_value(p,'department',0,100),p->>'role',(p->>'employment_start_date')::date,e.id) returning * into invitation;
  return to_jsonb(invitation);
end $$;

create function public.hr_finish_invitation(p_id uuid,p_auth_id uuid,p_success boolean) returns jsonb language plpgsql security definer set search_path=hr,pg_temp as $$
declare invitation hr.invitations; employee hr.employees;
begin
  select * into invitation from hr.invitations where id=p_id for update;
  if invitation.id is null then perform hr.fail('PT404','초대 기록이 없습니다.'); end if;
  perform 1 from hr.organizations where id=invitation.organization_id for update;
  if invitation.status='sent' then return jsonb_build_object('status','sent'); end if;
  if p_success then
    if not exists(select 1 from auth.users where id=p_auth_id and lower(email)=invitation.email) then perform hr.fail('PT400','초대 이메일과 인증 계정이 일치하지 않습니다.'); end if;
    if not exists(select 1 from hr.employees where id=invitation.invited_by and active and role='admin') then perform hr.fail('PT403','초대 관리자 권한을 다시 확인해 주세요.'); end if;
    insert into hr.employees(organization_id,auth_id,email,name,department,role,employment_start_date)
    values(invitation.organization_id,p_auth_id,invitation.email,invitation.name,invitation.department,invitation.role,invitation.employment_start_date) returning * into employee;
    update hr.invitations set status='sent',auth_id=p_auth_id where id=p_id;
    insert into hr.audit(organization_id,actor_id,entity_type,entity_id,action,after_data) values(invitation.organization_id,invitation.invited_by,'employee',employee.id,'employee.invited',to_jsonb(employee));
    return to_jsonb(employee);
  end if;
  update hr.invitations set status='failed' where id=p_id;
  return jsonb_build_object('status','failed');
end $$;
revoke all on function public.hr_finish_invitation(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.hr_finish_invitation(uuid,uuid,boolean) to service_role;
revoke all on all functions in schema hr from public,anon,authenticated;
