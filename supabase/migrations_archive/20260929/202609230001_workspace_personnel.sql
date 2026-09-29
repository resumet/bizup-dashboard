create schema personnel_private;
revoke all on schema personnel_private from public, anon, authenticated, service_role;

create table personnel_private.employees (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces,
  user_id uuid references auth.users on delete restrict,
  email text not null check(length(email) between 3 and 254),
  name text not null check(length(btrim(name)) between 1 and 100),
  address text not null default '' check(length(address)<=500),
  phone text not null default '' check(length(phone)<=40),
  memo text not null default '' check(length(memo)<=10000),
  resident_ciphertext text,
  employment_start_date date not null,
  contract_end_date date,
  annual_salary bigint check(annual_salary between 0 and 999999999999),
  status text not null default 'employed' check(status in ('employed','resigned','dismissed')),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  unique(workspace_id,user_id), unique(workspace_id,email),
  check(contract_end_date is null or contract_end_date>=employment_start_date)
);
create table personnel_private.periods (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references personnel_private.employees,
  start_date date not null, end_date date, end_reason text,
  check(end_date is null or end_date>=start_date)
);
create unique index personnel_one_current_period on personnel_private.periods(employee_id) where end_date is null;
create table personnel_private.events (
  id uuid primary key default gen_random_uuid(), employee_id uuid not null references personnel_private.employees,
  actor_id uuid references auth.users on delete restrict,
  action text not null, reason text not null check(length(btrim(reason)) between 1 and 2000),
  effective_date date not null, created_at timestamptz not null default now()
);
alter table personnel_private.employees enable row level security;
alter table personnel_private.periods enable row level security;
alter table personnel_private.events enable row level security;
revoke all on all tables in schema personnel_private from public,anon,authenticated,service_role;

-- Use the live workspace identities and existing leave-profile dates, not the retired HR schema.
insert into personnel_private.employees(workspace_id,user_id,email,name,employment_start_date)
select m.workspace_id,u.id,lower(u.email),left(coalesce(nullif(u.raw_user_meta_data->>'display_name',''),nullif(u.raw_user_meta_data->>'name',''),nullif(u.raw_user_meta_data->>'full_name',''),case when lower(u.email)='resumet@gmail.com' then '최고관리자' else split_part(u.email,'@',1) end),100),
  coalesce(p.employment_start_date,(m.created_at at time zone 'Asia/Seoul')::date)
from public.workspace_members m join auth.users u on u.id=m.user_id
left join public.hr_leave_profiles p on p.workspace_id=m.workspace_id and p.user_id=m.user_id where u.email is not null;
insert into personnel_private.periods(employee_id,start_date) select id,employment_start_date from personnel_private.employees;

create function personnel_private.assert_admin(w uuid,a uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=w and m.user_id=a
    and (m.role::text='super_admin' or lower(btrim(u.email))='resumet@gmail.com'))
    or exists(select 1 from personnel_private.employees where workspace_id=w and user_id=a and status<>'employed') then
    raise sqlstate 'PT403' using message='최고관리자만 임직원 정보를 관리할 수 있습니다.';
  end if;
end $$;

create function public.personnel_access(p_workspace_id uuid,p_user_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
select exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
and not exists(select 1 from personnel_private.employees where workspace_id=p_workspace_id and user_id=p_user_id and status<>'employed')
$$;
create function public.personnel_is_active(p_workspace_id uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$ select public.personnel_access(p_workspace_id,auth.uid()) $$;

create function public.personnel_directory(p_workspace_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name,'active',status='employed')),'[]') from personnel_private.employees where workspace_id=p_workspace_id and user_id is not null
$$;

create function public.personnel_query(p_workspace_id uuid,p_actor_id uuid,p_id uuid default null,p_page integer default 0,p_q text default '',p_status text default 'all')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare e personnel_private.employees; result jsonb;
begin
  perform personnel_private.assert_admin(p_workspace_id,p_actor_id);
  if p_id is not null then
    select * into e from personnel_private.employees where id=p_id and workspace_id=p_workspace_id;
    if not found then raise sqlstate 'PT404' using message='직원을 찾을 수 없습니다.'; end if;
    return jsonb_build_object('employee',to_jsonb(e)-'resident_ciphertext'||jsonb_build_object('has_resident_number',e.resident_ciphertext is not null),
      'periods',coalesce((select jsonb_agg(x order by x.start_date desc) from personnel_private.periods x where employee_id=e.id),'[]'),
      'events',coalesce((select jsonb_agg(x) from (select ev.*,coalesce(a.name,u.email,'관리자') actor_name from personnel_private.events ev left join auth.users u on u.id=ev.actor_id left join personnel_private.employees a on a.user_id=ev.actor_id and a.workspace_id=p_workspace_id where ev.employee_id=e.id order by ev.created_at desc,ev.id desc limit 100) x),'[]'));
  end if;
  if p_page<0 or p_page>100000 or p_status not in ('all','employed','resigned','dismissed') or length(p_q)>150 then raise sqlstate 'PT400' using message='조회 조건을 확인해 주세요.'; end if;
  with people as (select id,user_id,email,name,employment_start_date,status,version from personnel_private.employees where workspace_id=p_workspace_id
    and (p_status='all' or status=p_status) and (name ilike '%'||p_q||'%' or email ilike '%'||p_q||'%'))
  select jsonb_build_object('items',coalesce((select jsonb_agg(x) from (select * from people order by name,id limit 50 offset p_page*50) x),'[]'),'total',(select count(*) from people),
    'accounts',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'email',u.email)) from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace_id and u.email is not null and not exists(select 1 from personnel_private.employees registered where registered.workspace_id=p_workspace_id and registered.user_id=u.id)),'[]')) into result;
  return result;
end $$;

create function public.personnel_reveal(p_workspace_id uuid,p_actor_id uuid,p_id uuid) returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare ciphertext text;
begin
  perform personnel_private.assert_admin(p_workspace_id,p_actor_id);
  select resident_ciphertext into ciphertext from personnel_private.employees where id=p_id and workspace_id=p_workspace_id;
  if not found then raise sqlstate 'PT404' using message='직원을 찾을 수 없습니다.'; end if;
  insert into personnel_private.events(employee_id,actor_id,action,reason,effective_date) values(p_id,p_actor_id,'reveal','주민번호 조회',(now() at time zone 'Asia/Seoul')::date);
  return ciphertext;
end $$;

create function public.personnel_save(p_workspace_id uuid,p_actor_id uuid,p jsonb) returns uuid
language plpgsql security definer set search_path=public,pg_temp as $$
declare e personnel_private.employees; action text:=p->>'action'; today date:=(now() at time zone 'Asia/Seoul')::date;
  start_day date:=(p->>'employment_start_date')::date; effective date:=(p->>'effective_date')::date; target_user uuid:=nullif(p->>'user_id','')::uuid;
  account_email text; changed_id uuid;
begin
  perform 1 from public.workspaces where id=p_workspace_id for update;
  perform personnel_private.assert_admin(p_workspace_id,p_actor_id);
  if action is null or action not in ('hire','update','rehire','resign','dismiss') or start_day is null or effective is null or effective>today or start_day>today
    or length(btrim(coalesce(p->>'reason',''))) not between 1 and 2000 then raise sqlstate 'PT400' using message='처리 유형, 날짜, 사유를 확인해 주세요.'; end if;
  if target_user is not null then
    select u.email into account_email from auth.users u join public.workspace_members m on m.user_id=u.id where u.id=target_user and m.workspace_id=p_workspace_id;
    if not found then raise sqlstate 'PT400' using message='같은 워크스페이스의 계정만 연결할 수 있습니다.'; end if;
  end if;
  if action='hire' then
    if effective<>start_day then raise sqlstate 'PT400' using message='신규채용 기준일은 입사일과 같아야 합니다.'; end if;
    insert into personnel_private.employees(workspace_id,user_id,email,name,employment_start_date)
      values(p_workspace_id,target_user,lower(coalesce(account_email,p->>'email')),btrim(p->>'name'),start_day) returning * into e;
    insert into personnel_private.periods(employee_id,start_date) values(e.id,start_day);
  else
    select * into e from personnel_private.employees where id=(p->>'id')::uuid and workspace_id=p_workspace_id for update;
    if not found then raise sqlstate 'PT404' using message='직원을 찾을 수 없습니다.'; end if;
    if e.version is distinct from (p->>'expected_version')::integer then raise sqlstate 'PT409' using message='다른 변경이 있습니다. 다시 불러온 후 저장해 주세요.'; end if;
    if e.user_id is not null and target_user is distinct from e.user_id then raise sqlstate 'PT400' using message='기존 직원의 계정을 다른 계정으로 변경할 수 없습니다.'; end if;
    if action in ('resign','dismiss') then
      if e.status<>'employed' or effective<e.employment_start_date then raise sqlstate 'PT400' using message='재직 상태와 퇴직일을 확인해 주세요.'; end if;
      if start_day<>e.employment_start_date then raise sqlstate 'PT400' using message='퇴직 처리 시 입사일을 변경할 수 없습니다.'; end if;
      if e.user_id=p_actor_id then raise sqlstate 'PT409' using message='본인을 퇴직 처리할 수 없습니다.'; end if;
      if exists(select 1 from public.work_tasks where workspace_id=p_workspace_id and assignee_id=e.user_id and status='open') then raise sqlstate 'PT409' using message='미완료 업무를 먼저 완료하거나 이관해 주세요.'; end if;
      update personnel_private.periods set end_date=effective,end_reason=action where employee_id=e.id and end_date is null;
    elsif action='rehire' then
      if e.status='employed' or start_day<=coalesce((select max(end_date) from personnel_private.periods where employee_id=e.id),start_day) or effective<>start_day then raise sqlstate 'PT400' using message='재입사일은 이전 퇴직일 이후여야 하며 기준일과 같아야 합니다.'; end if;
      insert into personnel_private.periods(employee_id,start_date) values(e.id,start_day);
    else
      if e.status<>'employed' and start_day<>e.employment_start_date then raise sqlstate 'PT400' using message='종료된 재직 기간은 변경할 수 없습니다.'; end if;
      if exists(select 1 from personnel_private.periods where employee_id=e.id and end_date is not null and end_date>=start_day) and e.status='employed' then raise sqlstate 'PT400' using message='이전 재직 기간과 겹칩니다.'; end if;
      update personnel_private.periods set start_date=start_day where employee_id=e.id and end_date is null;
    end if;
  end if;
  update personnel_private.employees set user_id=target_user,email=lower(coalesce(account_email,p->>'email')),name=btrim(p->>'name'),address=p->>'address',phone=p->>'phone',memo=p->>'memo',
    employment_start_date=start_day,contract_end_date=nullif(p->>'contract_end_date','')::date,annual_salary=(p->>'annual_salary')::bigint,
    resident_ciphertext=case when p?'resident_ciphertext' then nullif(p->>'resident_ciphertext','') else resident_ciphertext end,
    status=case action when 'resign' then 'resigned' when 'dismiss' then 'dismissed' when 'rehire' then 'employed' else status end,
    version=version+1,updated_at=now() where id=e.id returning id into changed_id;
  if target_user is not null and action not in ('resign','dismiss') and (action in ('hire','rehire') or e.status='employed') then
    insert into public.hr_leave_profiles(workspace_id,user_id,employment_start_date,created_by,updated_by)
      values(p_workspace_id,target_user,start_day,p_actor_id,p_actor_id)
      on conflict(workspace_id,user_id) do update set employment_start_date=excluded.employment_start_date,updated_by=p_actor_id;
  end if;
  insert into personnel_private.events(employee_id,actor_id,action,reason,effective_date) values(e.id,p_actor_id,action,btrim(p->>'reason'),effective);
  return changed_id;
end $$;

-- Serialize task assignment with offboarding, including service-role writes.
create function personnel_private.guard_task() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.workspaces where id=new.workspace_id for update;
  if new.status='open' and not public.personnel_access(new.workspace_id,new.assignee_id) then raise sqlstate 'PT409' using message='퇴직한 직원에게 업무를 배정할 수 없습니다.'; end if;
  return new;
end $$;
create trigger personnel_task_guard before insert or update on public.work_tasks for each row execute function personnel_private.guard_task();
create function personnel_private.guard_leave() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  perform 1 from public.workspaces where id=new.workspace_id for update;
  if not public.personnel_access(new.workspace_id,new.user_id) then raise sqlstate 'PT403' using message='퇴직한 직원은 새 근태 기록을 등록할 수 없습니다.'; end if;
  return new;
end $$;
create trigger personnel_leave_guard before insert on public.hr_leave_requests for each row execute function personnel_private.guard_leave();
create trigger personnel_support_guard before insert on public.hr_leave_support_records for each row execute function personnel_private.guard_leave();

create policy personnel_active_read on public.work_tasks as restrictive for select to authenticated using(public.personnel_is_active(workspace_id));
create policy personnel_active_read on public.work_daily_reviews as restrictive for select to authenticated using(public.personnel_is_active(workspace_id));
create policy personnel_active_read on public.work_task_events as restrictive for select to authenticated using(exists(select 1 from public.work_tasks t where t.id=task_id and public.personnel_is_active(t.workspace_id)));
create policy personnel_active_read on public.hr_leave_profiles as restrictive for select to authenticated using(public.personnel_is_active(workspace_id));
create policy personnel_active_read on public.hr_annual_leave_grants as restrictive for select to authenticated using(public.personnel_is_active(workspace_id));
create policy personnel_active_read on public.hr_leave_requests as restrictive for select to authenticated using(public.personnel_is_active(workspace_id));
create policy personnel_active_read on public.hr_leave_support_records as restrictive for select to authenticated using(public.personnel_is_active(workspace_id));
revoke all on all functions in schema personnel_private from public,anon,authenticated,service_role;
revoke all on function public.personnel_access(uuid,uuid),public.personnel_directory(uuid),public.personnel_query(uuid,uuid,uuid,integer,text,text),public.personnel_reveal(uuid,uuid,uuid),public.personnel_save(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.personnel_access(uuid,uuid),public.personnel_directory(uuid),public.personnel_query(uuid,uuid,uuid,integer,text,text),public.personnel_reveal(uuid,uuid,uuid),public.personnel_save(uuid,uuid,jsonb) to service_role;
revoke all on function public.personnel_is_active(uuid) from public,anon;
grant execute on function public.personnel_is_active(uuid) to authenticated,service_role;
