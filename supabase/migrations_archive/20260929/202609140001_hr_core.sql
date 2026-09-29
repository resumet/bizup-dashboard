-- HR data is deliberately outside the REST-exposed public schema.
-- Only the narrowly scoped public RPCs grant access; helpers are not callable by clients.
create schema if not exists hr;
revoke all on schema hr from public, anon, authenticated;

create table hr.organizations (
  id uuid primary key default gen_random_uuid(), name text not null default 'HR & Work Dashboard',
  timezone text not null default 'Asia/Seoul' check (timezone = 'Asia/Seoul'), created_at timestamptz not null default now()
);
create table hr.employees (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  auth_id uuid unique references auth.users(id), email text not null, name text not null check (length(btrim(name)) between 1 and 100),
  department text not null default '', role text not null default 'employee' check (role in ('employee','admin')),
  active boolean not null default true, employment_start_date date not null, employment_end_date date,
  deactivated_at timestamptz, version integer not null default 1, created_at timestamptz not null default now(),
  unique(organization_id,email), unique(organization_id,id), check (email = lower(btrim(email))),
  check (employment_end_date is null or employment_end_date >= employment_start_date)
);
create table hr.policies (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  effective_from date not null, version integer not null, config jsonb not null,
  created_by uuid references hr.employees, created_at timestamptz not null default now(), unique(organization_id,version)
);
create index on hr.policies(organization_id,effective_from desc,version desc);
create table hr.attendance (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, employee_id uuid not null,
  work_date date not null, check_in_at timestamptz not null, check_out_at timestamptz,
  policy_id uuid not null references hr.policies, source text not null default 'check_in' check (source in ('check_in','correction')),
  version integer not null default 1, created_at timestamptz not null default now(),
  foreign key(organization_id,employee_id) references hr.employees(organization_id,id), unique(employee_id,work_date),
  check(check_out_at is null or check_out_at >= check_in_at)
);
create unique index hr_one_open_attendance on hr.attendance(employee_id) where check_out_at is null;
create index on hr.attendance(organization_id,work_date);
create table hr.corrections (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, employee_id uuid not null,
  work_date date not null, record_id uuid references hr.attendance, record_version integer,
  requested_in timestamptz not null, requested_out timestamptz, reason text not null check(length(btrim(reason)) between 1 and 2000),
  status text not null default 'pending' check(status in ('pending','applied','rejected')),
  reviewed_by uuid references hr.employees, review_reason text, reviewed_at timestamptz, created_at timestamptz not null default now(),
  foreign key(organization_id,employee_id) references hr.employees(organization_id,id), check(requested_out is null or requested_out >= requested_in)
);
create unique index hr_one_pending_correction on hr.corrections(employee_id,work_date) where status='pending';
create table hr.tasks (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  task_number bigint generated always as identity unique,
  title text not null check(length(btrim(title)) between 1 and 150), description text not null default '' check(length(description)<=10000),
  creator_id uuid not null, assignee_id uuid not null, watcher_ids uuid[] not null default '{}',
  planned_date date not null, status text not null default 'ready' check(status in ('ready','doing','done','cancelled')),
  completed_at timestamptz, cancelled_at timestamptz, version integer not null default 1,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,creator_id) references hr.employees(organization_id,id),
  foreign key(organization_id,assignee_id) references hr.employees(organization_id,id),
  check(not assignee_id=any(watcher_ids))
);
create index on hr.tasks(organization_id,assignee_id,planned_date);
create index on hr.tasks(organization_id,updated_at desc);
create index on hr.tasks using gin(watcher_ids);
create table hr.task_events (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references hr.tasks,
  actor_id uuid not null references hr.employees, event_type text not null, before_data jsonb, after_data jsonb,
  reason text not null default '', task_version integer not null, created_at timestamptz not null default now()
);
create index on hr.task_events(task_id,created_at);
create index on hr.task_events(actor_id,created_at);
create table hr.comments (
  id uuid primary key default gen_random_uuid(), task_id uuid not null references hr.tasks,
  author_id uuid not null references hr.employees, body text not null check(length(btrim(body)) between 1 and 10000), created_at timestamptz not null default now()
);
create table hr.reviews (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, employee_id uuid not null,
  work_date date not null, latest_revision integer not null default 0, submitted_at timestamptz,
  foreign key(organization_id,employee_id) references hr.employees(organization_id,id), unique(employee_id,work_date)
);
create table hr.review_revisions (
  id uuid primary key default gen_random_uuid(), review_id uuid not null references hr.reviews, revision integer not null,
  note text not null default '' check(length(note)<=3000), items jsonb not null, late boolean not null,
  submitted_at timestamptz not null default now(), unique(review_id,revision)
);
create table hr.leaves (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null, employee_id uuid not null,
  start_date date not null, end_date date not null, unit text not null check(unit in ('full','am','pm')),
  private_reason text not null default '' check(length(private_reason)<=2000), status text not null default 'registered' check(status in ('registered','cancelled')),
  created_by uuid not null references hr.employees, updated_by uuid not null references hr.employees,
  version integer not null default 1, cancelled_at timestamptz, cancellation_reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organization_id,employee_id) references hr.employees(organization_id,id),
  check(end_date>=start_date), check(unit='full' or start_date=end_date)
);
create table hr.leave_days (
  id uuid primary key default gen_random_uuid(), leave_id uuid not null references hr.leaves, organization_id uuid not null,
  employee_id uuid not null, day date not null, segment text not null check(segment in ('am','pm')),
  start_min integer not null, end_min integer not null, policy_id uuid not null references hr.policies,
  active boolean not null default true, leave_version integer not null, foreign key(organization_id,employee_id) references hr.employees(organization_id,id)
);
create unique index hr_leave_segment_unique on hr.leave_days(employee_id,day,segment) where active;
create index on hr.leave_days(organization_id,day) where active;
create table hr.audit (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  actor_id uuid not null references hr.employees, entity_type text not null, entity_id uuid not null, action text not null,
  before_data jsonb, after_data jsonb, reason text not null default '', created_at timestamptz not null default now()
);
create index on hr.audit(organization_id,entity_type,entity_id,created_at);
create table hr.outbox (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  event_key text not null unique, event_type text not null, entity_id uuid, actor_id uuid references hr.employees,
  payload jsonb not null default '{}', recipients uuid[] not null default '{}', include_actor boolean not null default false,
  processed_at timestamptz, attempts integer not null default 0, next_retry_at timestamptz not null default now(), last_error text,
  created_at timestamptz not null default now()
);
create index on hr.outbox(next_retry_at) where processed_at is null;
create table hr.notifications (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  event_id uuid not null references hr.outbox, recipient_id uuid not null references hr.employees,
  event_type text not null, entity_id uuid, payload jsonb not null, read_at timestamptz, created_at timestamptz not null default now(),
  unique(event_id,recipient_id)
);
create index on hr.notifications(recipient_id,created_at desc);
create table hr.commands (
  employee_id uuid not null references hr.employees, request_key uuid not null, command text not null,
  body jsonb not null, result jsonb not null, created_at timestamptz not null default now(), primary key(employee_id,request_key)
);
create table hr.invitations (
  id uuid primary key default gen_random_uuid(), organization_id uuid not null references hr.organizations,
  email text not null, name text not null, department text not null, role text not null check(role in ('employee','admin')),
  employment_start_date date not null, invited_by uuid not null references hr.employees,
  status text not null default 'pending' check(status in ('pending','sent','failed')), auth_id uuid references auth.users,
  created_at timestamptz not null default now(), unique(organization_id,email)
);

-- Defense in depth: no client table grants or policies; access only through vetted RPCs.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='hr' loop
    execute format('alter table hr.%I enable row level security',t.tablename);
  end loop;
end $$;
revoke all on all tables in schema hr from public, anon, authenticated;
revoke all on all sequences in schema hr from public, anon, authenticated;
alter default privileges in schema hr revoke execute on functions from public;

create function hr.fail(code text, message text) returns void language plpgsql as $$
begin raise exception using errcode=code, message=message; end $$;

create function hr.me() returns hr.employees language plpgsql stable security definer set search_path=hr,pg_temp as $$
declare e hr.employees;
begin
  if auth.uid() is null then perform hr.fail('PT401','로그인이 필요합니다.'); end if;
  select * into e from hr.employees where auth_id=auth.uid() and active;
  if e.id is null then perform hr.fail('PT403','HR 이용 권한이 없습니다. 관리자에게 직원 초대를 요청해 주세요.'); end if;
  return e;
end $$;
create function hr.today() returns date language sql stable as $$ select (now() at time zone 'Asia/Seoul')::date $$;
create function hr.at_day(d date,m integer) returns timestamptz language sql immutable as $$ select (d::timestamp + make_interval(mins=>m)) at time zone 'Asia/Seoul' $$;
create function hr.policy(org uuid,d date) returns hr.policies language sql stable as $$ select p from hr.policies p where organization_id=org and effective_from<=d order by effective_from desc,version desc limit 1 $$;
create function hr.admins(org uuid) returns uuid[] language sql stable as $$ select coalesce(array_agg(id),'{}') from hr.employees where organization_id=org and active and role='admin' $$;
create function hr.can_read(t hr.tasks,e hr.employees) returns boolean language sql immutable as $$
  select t.organization_id=e.organization_id and (e.role='admin' or e.id in(t.creator_id,t.assignee_id) or e.id=any(t.watcher_ids))
$$;
create function hr.employee_check(org uuid,ids uuid[]) returns void language plpgsql as $$
begin
  if exists(select 1 from unnest(ids) selected(employee_id) where not exists(select 1 from hr.employees e where e.id=selected.employee_id and e.organization_id=org and e.active)) then
    perform hr.fail('PT400','같은 조직의 활성 직원만 선택할 수 있습니다.');
  end if;
end $$;
create function hr.emit(org uuid,key text,kind text,entity uuid,actor uuid,targets uuid[],payload jsonb default '{}',include_self boolean default false) returns void language sql as $$
  insert into hr.outbox(organization_id,event_key,event_type,entity_id,actor_id,recipients,payload,include_actor)
  values(org,key,kind,entity,actor,array(select distinct x from unnest(targets) x where x is not null and (include_self or x is distinct from actor)),payload,include_self)
  on conflict(event_key) do nothing
$$;
create function hr.log(e hr.employees,kind text,entity uuid,action text,old_data jsonb,new_data jsonb,reason text default '') returns void language sql as $$
  insert into hr.audit(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(e.organization_id,e.id,kind,entity,action,old_data,new_data,reason)
$$;

create function public.hr_bootstrap(p_auth_id uuid,p_name text,p_start_date date,p_organization_name text default 'HR & Work Dashboard') returns uuid
language plpgsql security definer set search_path=hr,pg_temp as $$
declare org uuid; email_address text;
begin
  perform pg_advisory_xact_lock(74219301);
  if exists(select 1 from hr.organizations) then perform hr.fail('PT409','HR 초기 설정이 이미 완료되었습니다.'); end if;
  select lower(email) into email_address from auth.users where id=p_auth_id;
  if email_address is null then perform hr.fail('PT400','인증 계정을 먼저 생성해 주세요.'); end if;
  insert into hr.organizations(name) values(p_organization_name) returning id into org;
  insert into hr.employees(organization_id,auth_id,email,name,role,employment_start_date) values(org,p_auth_id,email_address,p_name,'admin',p_start_date);
  insert into hr.policies(organization_id,effective_from,version,config) values(org,'1900-01-01',1,
    '{"weekdays":[1,2,3,4,5],"start":540,"end":1080,"breaks":[[720,780]],"split":840,"grace":0,"holidays":[]}');
  return org;
end $$;
revoke all on function public.hr_bootstrap(uuid,text,date,text) from public,anon,authenticated;
grant execute on function public.hr_bootstrap(uuid,text,date,text) to service_role;
revoke all on all functions in schema hr from public,anon,authenticated;
