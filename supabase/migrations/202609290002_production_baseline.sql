-- Production baseline captured 2026-09-29 from the linked Supabase project.
-- NEVER execute this file on an existing production schema. Its history was
-- recorded without replaying this SQL. Historical files are archived separately.
-- Includes public/hr/personnel_private, managed-schema customizations and only
-- global configuration seeds; NO workspace, user, HR, payroll or uploaded data.
-- Requires Supabase-managed auth/storage schemas and roles; PostgreSQL >= 17.
DO $baseline_guard$ BEGIN
  IF to_regclass('public.workspaces') IS NOT NULL
     OR to_regclass('hr.employees') IS NOT NULL
     OR to_regclass('personnel_private.employees') IS NOT NULL THEN
    RAISE EXCEPTION 'Baseline is for a fresh database only. Do not replay it on production.';
  END IF;
END $baseline_guard$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
-- Neutralize ambient Supabase public defaults during restore so restricted
-- objects do not accidentally inherit grants absent from the source catalog.
-- The captured defaults are restored by the dump's final DEFAULT ACL section.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon, authenticated, service_role;

--
-- PostgreSQL database dump
--


-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.11

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: hr; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS "hr";


ALTER SCHEMA "hr" OWNER TO "postgres";

--
-- Name: personnel_private; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA IF NOT EXISTS "personnel_private";


ALTER SCHEMA "personnel_private" OWNER TO "postgres";

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: pg_database_owner
--

CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";

--
-- Name: SCHEMA "public"; Type: COMMENT; Schema: -; Owner: pg_database_owner
--

COMMENT ON SCHEMA "public" IS 'standard public schema';


--
-- Name: app_role; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."app_role" AS ENUM (
    'admin',
    'operator',
    'viewer',
    'super_admin',
    'user'
);


ALTER TYPE "public"."app_role" OWNER TO "postgres";

--
-- Name: service_status; Type: TYPE; Schema: public; Owner: postgres
--

CREATE TYPE "public"."service_status" AS ENUM (
    'active',
    'coming_soon',
    'disabled'
);


ALTER TYPE "public"."service_status" OWNER TO "postgres";

--
-- Name: admins("uuid"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."admins"("org" "uuid") RETURNS "uuid"[]
    LANGUAGE "sql" STABLE
    AS $$ select coalesce(array_agg(id),'{}') from hr.employees where organization_id=org and active and role='admin' $$;


ALTER FUNCTION "hr"."admins"("org" "uuid") OWNER TO "postgres";

--
-- Name: assert_version(integer, "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."assert_version"("actual" integer, "p" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin if actual is distinct from (p->>'expected_version')::integer then perform hr.fail('PT409','다른 변경이 먼저 저장되었습니다. 최신 내용을 다시 불러와 확인해 주세요.'); end if; end $$;


ALTER FUNCTION "hr"."assert_version"("actual" integer, "p" "jsonb") OWNER TO "postgres";

--
-- Name: at_day("date", integer); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."at_day"("d" "date", "m" integer) RETURNS timestamp with time zone
    LANGUAGE "sql" IMMUTABLE
    AS $$ select (d::timestamp + make_interval(mins=>m)) at time zone 'Asia/Seoul' $$;


ALTER FUNCTION "hr"."at_day"("d" "date", "m" integer) OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";

--
-- Name: employees; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "auth_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "department" "text" DEFAULT ''::"text" NOT NULL,
    "role" "text" DEFAULT 'employee'::"text" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "employment_start_date" "date" NOT NULL,
    "employment_end_date" "date",
    "deactivated_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_deleted_at" timestamp with time zone,
    CONSTRAINT "employees_check" CHECK ((("employment_end_date" IS NULL) OR ("employment_end_date" >= "employment_start_date"))),
    CONSTRAINT "employees_email_check" CHECK (("email" = "lower"("btrim"("email")))),
    CONSTRAINT "employees_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 100))),
    CONSTRAINT "employees_role_check" CHECK (("role" = ANY (ARRAY['employee'::"text", 'admin'::"text"])))
);


ALTER TABLE "hr"."employees" OWNER TO "postgres";

--
-- Name: attendance_command("hr"."employees", "text", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."attendance_command"("e" "hr"."employees", "action" "text", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "hr"."attendance_command"("e" "hr"."employees", "action" "text", "p" "jsonb") OWNER TO "postgres";

--
-- Name: attendance; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."attendance" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "check_in_at" timestamp with time zone NOT NULL,
    "check_out_at" timestamp with time zone,
    "policy_id" "uuid" NOT NULL,
    "source" "text" DEFAULT 'check_in'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "employee_snapshot" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "attendance_check" CHECK ((("check_out_at" IS NULL) OR ("check_out_at" >= "check_in_at"))),
    CONSTRAINT "attendance_source_check" CHECK (("source" = ANY (ARRAY['check_in'::"text", 'correction'::"text"])))
);


ALTER TABLE "hr"."attendance" OWNER TO "postgres";

--
-- Name: attendance_conflicts("hr"."attendance", "uuid"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."attendance_conflicts"("a" "hr"."attendance", "actor" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare l record;
begin
  for l in select distinct leave_id,leave_version from hr.leave_days d where d.employee_id=a.employee_id and d.active
    and tstzrange(a.check_in_at,coalesce(a.check_out_at,greatest(now(),a.check_in_at)+interval '1 microsecond'),'[)') && tstzrange(hr.at_day(d.day,d.start_min),hr.at_day(d.day,d.end_min),'[)') loop
    perform hr.emit(a.organization_id,'conflict:'||a.id||':'||a.version||':'||l.leave_id||':'||l.leave_version,'attendance.conflict',a.id,actor,
      hr.admins(a.organization_id)||a.employee_id,jsonb_build_object('employee_id',a.employee_id,'work_date',a.work_date),true);
  end loop;
end $$;


ALTER FUNCTION "hr"."attendance_conflicts"("a" "hr"."attendance", "actor" "uuid") OWNER TO "postgres";

--
-- Name: attendance_summary("hr"."employees", "date"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."attendance_summary"("e" "hr"."employees", "d" "date") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $$
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


ALTER FUNCTION "hr"."attendance_summary"("e" "hr"."employees", "d" "date") OWNER TO "postgres";

--
-- Name: tasks; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "task_number" bigint NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "assignee_id" "uuid" NOT NULL,
    "watcher_ids" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "planned_date" "date" NOT NULL,
    "status" "text" DEFAULT 'ready'::"text" NOT NULL,
    "completed_at" timestamp with time zone,
    "cancelled_at" timestamp with time zone,
    "version" integer DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "tasks_check" CHECK ((NOT ("assignee_id" = ANY ("watcher_ids")))),
    CONSTRAINT "tasks_description_check" CHECK (("length"("description") <= 10000)),
    CONSTRAINT "tasks_status_check" CHECK (("status" = ANY (ARRAY['ready'::"text", 'doing'::"text", 'done'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "tasks_title_check" CHECK ((("length"("btrim"("title")) >= 1) AND ("length"("btrim"("title")) <= 150)))
);


ALTER TABLE "hr"."tasks" OWNER TO "postgres";

--
-- Name: can_read("hr"."tasks", "hr"."employees"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."can_read"("t" "hr"."tasks", "e" "hr"."employees") RETURNS boolean
    LANGUAGE "sql" IMMUTABLE
    AS $$
  select t.organization_id=e.organization_id and (e.role='admin' or e.id in(t.creator_id,t.assignee_id) or e.id=any(t.watcher_ids))
$$;


ALTER FUNCTION "hr"."can_read"("t" "hr"."tasks", "e" "hr"."employees") OWNER TO "postgres";

--
-- Name: correction_command("hr"."employees", "text", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."correction_command"("e" "hr"."employees", "action" "text", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "hr"."correction_command"("e" "hr"."employees", "action" "text", "p" "jsonb") OWNER TO "postgres";

--
-- Name: deactivate_work_account("uuid"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."deactivate_work_account"("account_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE person hr.employees; previous hr.employees;
BEGIN
  SELECT * INTO person FROM hr.employees WHERE auth_id=account_id;
  IF person.id IS NULL THEN RETURN; END IF;
  PERFORM 1 FROM hr.organizations WHERE id=person.organization_id FOR UPDATE;
  SELECT * INTO person FROM hr.employees WHERE auth_id=account_id FOR UPDATE;
  IF person.id IS NULL THEN RETURN; END IF;
  IF person.active AND person.role='admin' AND NOT EXISTS(
    SELECT 1 FROM hr.employees WHERE organization_id=person.organization_id AND active AND role='admin' AND id<>person.id
  ) THEN PERFORM hr.fail('PT409','마지막 HR 관리자는 계정을 삭제할 수 없습니다. 다른 HR 관리자를 먼저 지정해 주세요.'); END IF;
  IF EXISTS(SELECT 1 FROM hr.tasks WHERE assignee_id=person.id AND status IN ('ready','doing')) THEN
    PERFORM hr.fail('PT409','HR의 미완료 담당 업무를 이관한 뒤 계정을 삭제해 주세요.');
  END IF;
  IF EXISTS(SELECT 1 FROM hr.attendance WHERE employee_id=person.id AND check_out_at IS NULL) THEN
    PERFORM hr.fail('PT409','HR의 열린 출근 기록을 퇴근 또는 정정 처리한 뒤 계정을 삭제해 주세요.');
  END IF;
  previous:=person;
  UPDATE hr.employees SET active=false,auth_id=NULL,auth_deleted_at=now(),deactivated_at=coalesce(deactivated_at,now()),
    employment_end_date=coalesce(employment_end_date,greatest(employment_start_date,hr.today())),version=version+1
    WHERE id=person.id RETURNING * INTO person;
  UPDATE hr.invitations SET auth_id=NULL,auth_deleted_at=now()
    WHERE organization_id=person.organization_id AND auth_deleted_at IS NULL
      AND (auth_id=account_id OR (auth_id IS NULL AND email=person.email));
  INSERT INTO hr.audit(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason)
    VALUES(person.organization_id,NULL,'employee',person.id,'employee.deactivated_from_work',to_jsonb(previous),to_jsonb(person),'WORK 인증 계정 삭제에 따른 자동 비활성화');
END $$;


ALTER FUNCTION "hr"."deactivate_work_account"("account_id" "uuid") OWNER TO "postgres";

--
-- Name: emit("uuid", "text", "text", "uuid", "uuid", "uuid"[], "jsonb", boolean); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."emit"("org" "uuid", "key" "text", "kind" "text", "entity" "uuid", "actor" "uuid", "targets" "uuid"[], "payload" "jsonb" DEFAULT '{}'::"jsonb", "include_self" boolean DEFAULT false) RETURNS "void"
    LANGUAGE "sql"
    AS $$
  insert into hr.outbox(organization_id,event_key,event_type,entity_id,actor_id,recipients,payload,include_actor)
  values(org,key,kind,entity,actor,array(select distinct x from unnest(targets) x where x is not null and (include_self or x is distinct from actor)),payload,include_self)
  on conflict(event_key) do nothing
$$;


ALTER FUNCTION "hr"."emit"("org" "uuid", "key" "text", "kind" "text", "entity" "uuid", "actor" "uuid", "targets" "uuid"[], "payload" "jsonb", "include_self" boolean) OWNER TO "postgres";

--
-- Name: employee_check("uuid", "uuid"[]); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."employee_check"("org" "uuid", "ids" "uuid"[]) RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin
  if exists(select 1 from unnest(ids) selected(employee_id) where not exists(select 1 from hr.employees e where e.id=selected.employee_id and e.organization_id=org and e.active)) then
    perform hr.fail('PT400','같은 조직의 활성 직원만 선택할 수 있습니다.');
  end if;
end $$;


ALTER FUNCTION "hr"."employee_check"("org" "uuid", "ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: employee_command("hr"."employees", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."employee_command"("e" "hr"."employees", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "hr"."employee_command"("e" "hr"."employees", "p" "jsonb") OWNER TO "postgres";

--
-- Name: fail("text", "text"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."fail"("code" "text", "message" "text") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
begin raise exception using errcode=code, message=message; end $$;


ALTER FUNCTION "hr"."fail"("code" "text", "message" "text") OWNER TO "postgres";

--
-- Name: guard_employee_dates(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."guard_employee_dates"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
begin
  if new.employment_end_date is not null and exists(select 1 from hr.attendance where employee_id=new.id and work_date>new.employment_end_date) then perform hr.fail('PT400','퇴사일 이후에 근태 기록이 있습니다. 기존 기록을 확인해 주세요.'); end if;
  return new;
end $$;


ALTER FUNCTION "hr"."guard_employee_dates"() OWNER TO "postgres";

--
-- Name: invitation_command("hr"."employees", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."invitation_command"("e" "hr"."employees", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $_$
DECLARE invitation hr.invitations; address text:=lower(hr.text_value(p,'email',3,254));
BEGIN
  IF e.role<>'admin' THEN PERFORM hr.fail('PT403','관리자만 직원을 초대할 수 있습니다.'); END IF;
  PERFORM hr.only_keys(p,array['email','name','department','role','employment_start_date']);
  IF address !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR p->>'role' NOT IN ('employee','admin') OR NOT p?'employment_start_date' THEN PERFORM hr.fail('PT400','이메일·역할·입사일을 확인해 주세요.'); END IF;
  IF EXISTS(SELECT 1 FROM hr.employees WHERE organization_id=e.organization_id AND email=address AND auth_deleted_at IS NULL) THEN PERFORM hr.fail('PT409','이미 등록된 직원입니다.'); END IF;
  INSERT INTO hr.invitations(organization_id,email,name,department,role,employment_start_date,invited_by)
    VALUES(e.organization_id,address,hr.text_value(p,'name',1,100),hr.text_value(p,'department',0,100),p->>'role',(p->>'employment_start_date')::date,e.id) RETURNING * INTO invitation;
  RETURN to_jsonb(invitation);
END $_$;


ALTER FUNCTION "hr"."invitation_command"("e" "hr"."employees", "p" "jsonb") OWNER TO "postgres";

--
-- Name: leave_command("hr"."employees", "text", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."leave_command"("e" "hr"."employees", "action" "text", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "hr"."leave_command"("e" "hr"."employees", "action" "text", "p" "jsonb") OWNER TO "postgres";

--
-- Name: leaves; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."leaves" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date" NOT NULL,
    "unit" "text" NOT NULL,
    "private_reason" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'registered'::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "cancelled_at" timestamp with time zone,
    "cancellation_reason" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "leaves_check" CHECK (("end_date" >= "start_date")),
    CONSTRAINT "leaves_check1" CHECK ((("unit" = 'full'::"text") OR ("start_date" = "end_date"))),
    CONSTRAINT "leaves_private_reason_check" CHECK (("length"("private_reason") <= 2000)),
    CONSTRAINT "leaves_status_check" CHECK (("status" = ANY (ARRAY['registered'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "leaves_unit_check" CHECK (("unit" = ANY (ARRAY['full'::"text", 'am'::"text", 'pm'::"text"])))
);


ALTER TABLE "hr"."leaves" OWNER TO "postgres";

--
-- Name: leave_expand("hr"."leaves"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."leave_expand"("l" "hr"."leaves") RETURNS "void"
    LANGUAGE "plpgsql"
    AS $$
declare preview jsonb;
begin
  preview:=hr.leave_preview(l.organization_id,l.start_date,l.end_date,l.unit);
  insert into hr.leave_days(leave_id,organization_id,employee_id,day,segment,start_min,end_min,policy_id,leave_version)
  select l.id,l.organization_id,l.employee_id,(x->>'day')::date,x->>'segment',(x->>'start_min')::integer,(x->>'end_min')::integer,(x->>'policy_id')::uuid,l.version
  from jsonb_array_elements(preview->'days') x;
end $$;


ALTER FUNCTION "hr"."leave_expand"("l" "hr"."leaves") OWNER TO "postgres";

--
-- Name: leave_preview("uuid", "date", "date", "text"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."leave_preview"("org" "uuid", "start_day" "date", "end_day" "date", "unit" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql" STABLE
    AS $$
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


ALTER FUNCTION "hr"."leave_preview"("org" "uuid", "start_day" "date", "end_day" "date", "unit" "text") OWNER TO "postgres";

--
-- Name: log("hr"."employees", "text", "uuid", "text", "jsonb", "jsonb", "text"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."log"("e" "hr"."employees", "kind" "text", "entity" "uuid", "action" "text", "old_data" "jsonb", "new_data" "jsonb", "reason" "text" DEFAULT ''::"text") RETURNS "void"
    LANGUAGE "sql"
    AS $$
  insert into hr.audit(organization_id,actor_id,entity_type,entity_id,action,before_data,after_data,reason) values(e.organization_id,e.id,kind,entity,action,old_data,new_data,reason)
$$;


ALTER FUNCTION "hr"."log"("e" "hr"."employees", "kind" "text", "entity" "uuid", "action" "text", "old_data" "jsonb", "new_data" "jsonb", "reason" "text") OWNER TO "postgres";

--
-- Name: me(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."me"() RETURNS "hr"."employees"
    LANGUAGE "plpgsql" STABLE SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
declare e hr.employees;
begin
  if auth.uid() is null then perform hr.fail('PT401','로그인이 필요합니다.'); end if;
  select * into e from hr.employees where auth_id=auth.uid() and active;
  if e.id is null then perform hr.fail('PT403','HR 이용 권한이 없습니다. 관리자에게 직원 초대를 요청해 주세요.'); end if;
  return e;
end $$;


ALTER FUNCTION "hr"."me"() OWNER TO "postgres";

--
-- Name: on_work_account_created_or_updated(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."on_work_account_created_or_updated"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
BEGIN
  IF TG_OP='INSERT' THEN PERFORM hr.sync_work_account(NEW.id);
  ELSIF (to_jsonb(NEW)->>'deleted_at') IS DISTINCT FROM (to_jsonb(OLD)->>'deleted_at') AND to_jsonb(NEW)->>'deleted_at' IS NOT NULL THEN
    PERFORM hr.deactivate_work_account(OLD.id);
  ELSIF NEW.email IS DISTINCT FROM OLD.email AND coalesce(to_jsonb(NEW)->>'deleted_at','')='' THEN
    PERFORM hr.sync_work_account(NEW.id);
  END IF;
  RETURN NEW;
END $$;


ALTER FUNCTION "hr"."on_work_account_created_or_updated"() OWNER TO "postgres";

--
-- Name: on_work_account_deleted(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."on_work_account_deleted"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
BEGIN PERFORM hr.deactivate_work_account(OLD.id); RETURN OLD; END $$;


ALTER FUNCTION "hr"."on_work_account_deleted"() OWNER TO "postgres";

--
-- Name: only_keys("jsonb", "text"[]); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."only_keys"("p" "jsonb", "keys" "text"[]) RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
begin
  if jsonb_typeof(p)<>'object' or exists(select 1 from jsonb_object_keys(p) k where not k=any(keys)) then perform hr.fail('PT400','허용되지 않은 입력 필드입니다.'); end if;
end $$;


ALTER FUNCTION "hr"."only_keys"("p" "jsonb", "keys" "text"[]) OWNER TO "postgres";

--
-- Name: person_at("hr"."employees", "date"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."person_at"("e" "hr"."employees", "d" "date") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select coalesce((select before_data from hr.audit where entity_type='employee' and entity_id=e.id and action='employee.update' and created_at>=hr.at_day(d+1,0) order by created_at limit 1),to_jsonb(e))
$$;


ALTER FUNCTION "hr"."person_at"("e" "hr"."employees", "d" "date") OWNER TO "postgres";

--
-- Name: personnel_actor(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."personnel_actor"() RETURNS "hr"."employees"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
declare actor hr.employees;
begin
  if not exists(select 1 from auth.users where id=auth.uid() and lower(btrim(email))='resumet@gmail.com') then
    perform hr.fail('PT403','최고관리자만 임직원 정보를 관리할 수 있습니다.');
  end if;
  actor:=hr.me();
  return actor;
end $$;


ALTER FUNCTION "hr"."personnel_actor"() OWNER TO "postgres";

--
-- Name: policies; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."policies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "effective_from" "date" NOT NULL,
    "version" integer NOT NULL,
    "config" "jsonb" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "hr"."policies" OWNER TO "postgres";

--
-- Name: policy("uuid", "date"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."policy"("org" "uuid", "d" "date") RETURNS "hr"."policies"
    LANGUAGE "sql" STABLE
    AS $$ select p from hr.policies p where organization_id=org and effective_from<=d order by effective_from desc,version desc limit 1 $$;


ALTER FUNCTION "hr"."policy"("org" "uuid", "d" "date") OWNER TO "postgres";

--
-- Name: policy_command("hr"."employees", "text", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."policy_command"("e" "hr"."employees", "action" "text", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
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


ALTER FUNCTION "hr"."policy_command"("e" "hr"."employees", "action" "text", "p" "jsonb") OWNER TO "postgres";

--
-- Name: remaining_intervals("uuid", "uuid", "date", "uuid"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."remaining_intervals"("org" "uuid", "employee" "uuid", "d" "date", "policy_override" "uuid" DEFAULT NULL::"uuid") RETURNS "int4multirange"
    LANGUAGE "plpgsql" STABLE
    AS $$
declare pol hr.policies; spans int4multirange; l hr.leave_days;
begin
  if policy_override is null then pol:=hr.policy(org,d); else select * into pol from hr.policies where id=policy_override and organization_id=org; end if;
  spans := hr.work_intervals(pol.config,d);
  for l in select * from hr.leave_days where employee_id=employee and day=d and active loop
    spans := spans-int4multirange(int4range(l.start_min,l.end_min,'[)'));
  end loop;
  return spans;
end $$;


ALTER FUNCTION "hr"."remaining_intervals"("org" "uuid", "employee" "uuid", "d" "date", "policy_override" "uuid") OWNER TO "postgres";

--
-- Name: review_command("hr"."employees", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."review_command"("e" "hr"."employees", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare d date := (p->>'work_date')::date; r hr.reviews; t hr.tasks; item jsonb; snapshots jsonb := '[]'; revision hr.review_revisions; seen uuid[] := '{}';
begin
  perform hr.only_keys(p,array['work_date','expected_version','note','items']);
  if d is null or d>hr.today() or d<e.employment_start_date then perform hr.fail('PT400','재직 기간 내 오늘 또는 과거 근무일을 선택해 주세요.'); end if;
  if jsonb_typeof(p->'items') is distinct from 'array' then perform hr.fail('PT400','정리할 업무 목록을 확인해 주세요.'); end if;
  insert into hr.reviews(organization_id,employee_id,work_date) values(e.organization_id,e.id,d) on conflict(employee_id,work_date) do nothing;
  select * into r from hr.reviews where employee_id=e.id and work_date=d for update;
  perform hr.assert_version(r.latest_revision,p);
  for item in select * from jsonb_array_elements(p->'items') loop
    select * into t from hr.tasks where id=(item->>'id')::uuid;
    if t.id is null or not hr.can_read(t,e) then perform hr.fail('PT404','조회할 수 없는 업무가 포함되어 있습니다. 목록을 새로고침해 주세요.'); end if;
    if t.id=any(seen) then perform hr.fail('PT400','같은 업무를 여러 번 정리할 수 없습니다.'); end if;
    perform hr.assert_version(t.version,item);
    seen := seen||t.id;
    snapshots := snapshots||jsonb_build_array(jsonb_build_object('id',t.id,'task_number',t.task_number,'title',t.title,'status',t.status,'version',t.version,
      'assignee_id',t.assignee_id,'assignee_name',(select name from hr.employees where id=t.assignee_id),'submitted_by',e.id,'work_note',hr.text_value(item,'work_note',0,3000)));
  end loop;
  insert into hr.review_revisions(review_id,revision,note,items,late) values(r.id,r.latest_revision+1,hr.text_value(p,'note',0,3000),snapshots,
    d<hr.today() or exists(select 1 from hr.attendance where employee_id=e.id and work_date=d and check_out_at is not null)) returning * into revision;
  update hr.reviews set latest_revision=revision.revision,submitted_at=revision.submitted_at where id=r.id;
  return to_jsonb(revision);
end $$;


ALTER FUNCTION "hr"."review_command"("e" "hr"."employees", "p" "jsonb") OWNER TO "postgres";

--
-- Name: snapshot_attendance(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."snapshot_attendance"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
begin
  new.employee_snapshot := (select jsonb_build_object('name',name,'department',department) from hr.employees where id=new.employee_id);
  return new;
end $$;


ALTER FUNCTION "hr"."snapshot_attendance"() OWNER TO "postgres";

--
-- Name: snapshot_task_event(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."snapshot_task_event"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
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


ALTER FUNCTION "hr"."snapshot_task_event"() OWNER TO "postgres";

--
-- Name: sync_all_work_accounts(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."sync_all_work_accounts"() RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE account_id uuid; count_before bigint; excluded integer:=0;
BEGIN
  SELECT count(*) INTO count_before FROM hr.employees;
  FOR account_id IN SELECT id FROM auth.users ORDER BY id LOOP
    IF hr.sync_work_account(account_id) IS NULL THEN excluded:=excluded+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('added',(SELECT count(*) FROM hr.employees)-count_before,'total',(SELECT count(*) FROM hr.employees),'unlinked_or_deleted',excluded);
END $$;


ALTER FUNCTION "hr"."sync_all_work_accounts"() OWNER TO "postgres";

--
-- Name: sync_work_account("uuid"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."sync_work_account"("account_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE account_data jsonb; meta jsonb; address text; organization uuid; person hr.employees; invitation hr.invitations;
  display_name text; department_name text; enabled boolean;
BEGIN
  SELECT to_jsonb(u) INTO account_data FROM auth.users u WHERE id=account_id;
  IF account_data IS NULL THEN RETURN NULL; END IF;
  IF account_data->>'deleted_at' IS NOT NULL THEN PERFORM hr.deactivate_work_account(account_id); RETURN NULL; END IF;
  SELECT id INTO person.id FROM hr.employees WHERE auth_id=account_id;
  IF person.id IS NOT NULL THEN RETURN person.id; END IF;
  -- P0 is a single HR organization. Never choose an arbitrary organization.
  IF (SELECT count(*) FROM hr.organizations)<>1 THEN RETURN NULL; END IF;
  SELECT id INTO organization FROM hr.organizations;
  PERFORM 1 FROM hr.organizations WHERE id=organization FOR UPDATE;
  SELECT * INTO person FROM hr.employees WHERE auth_id=account_id;
  IF person.id IS NOT NULL THEN RETURN person.id; END IF;
  address:=lower(btrim(account_data->>'email'));
  IF address IS NULL OR address='' THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM hr.employees WHERE organization_id=organization AND email=address AND auth_deleted_at IS NULL) THEN
    -- An email match alone must not grant access to an existing person's history.
    RETURN NULL;
  END IF;
  meta:=coalesce(account_data->'raw_user_meta_data','{}');
  SELECT value INTO display_name FROM (VALUES
    (1,CASE WHEN jsonb_typeof(meta->'full_name')='string' THEN nullif(btrim(meta->>'full_name'),'') END),
    (2,CASE WHEN jsonb_typeof(meta->'name')='string' THEN nullif(btrim(meta->>'name'),'') END),
    (3,CASE WHEN jsonb_typeof(meta->'user_name')='string' THEN nullif(btrim(meta->>'user_name'),'') END),
    (4,coalesce(nullif(split_part(address,'@',1),''),address))
  ) names(priority,value) WHERE value IS NOT NULL ORDER BY priority LIMIT 1;
  department_name:=CASE WHEN jsonb_typeof(meta->'department')='string' THEN btrim(meta->>'department') ELSE '' END;
  enabled:=coalesce((account_data->>'banned_until')::timestamptz<=now(),true);
  -- Only an invitation created by a still-active HR administrator may grant an HR role.
  -- User-editable authentication metadata never controls HR privileges.
  SELECT i.* INTO invitation FROM hr.invitations i JOIN hr.employees administrator ON administrator.id=i.invited_by
    WHERE i.organization_id=organization AND i.email=address AND i.auth_deleted_at IS NULL
      AND i.status IN ('pending','sending','failed') AND administrator.active AND administrator.role='admin';
  INSERT INTO hr.employees(organization_id,auth_id,email,name,department,role,active,employment_start_date,deactivated_at)
    VALUES(organization,account_id,address,coalesce(invitation.name,left(display_name,100)),coalesce(invitation.department,left(department_name,100)),
      coalesce(invitation.role,'employee'),enabled,coalesce(invitation.employment_start_date,hr.today()),CASE WHEN NOT enabled THEN now() END)
    RETURNING * INTO person;
  INSERT INTO hr.audit(organization_id,actor_id,entity_type,entity_id,action,after_data,reason)
    VALUES(organization,invitation.invited_by,'employee',person.id,'employee.created_from_work',to_jsonb(person),'WORK 기존 인증 계정 자동 연결');
  RETURN person.id;
END $$;


ALTER FUNCTION "hr"."sync_work_account"("account_id" "uuid") OWNER TO "postgres";

--
-- Name: task_command("hr"."employees", "text", "jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."task_command"("e" "hr"."employees", "action" "text", "p" "jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
declare t hr.tasks; old_t hr.tasks; target uuid; watchers uuid[]; added uuid[]; reason text; comment_id uuid; new_status text;
begin
  if action='task.create' then
    perform hr.only_keys(p,array['title','description','assignee_id','watcher_ids','planned_date']);
    target := coalesce((p->>'assignee_id')::uuid,e.id);
    watchers := array(select distinct value::uuid from jsonb_array_elements_text(coalesce(p->'watcher_ids','[]')) where value::uuid<>target);
    perform hr.employee_check(e.organization_id,watchers||target);
    insert into hr.tasks(organization_id,title,description,creator_id,assignee_id,watcher_ids,planned_date)
    values(e.organization_id,hr.text_value(p,'title',1,150),hr.text_value(p,'description',0,10000),e.id,target,watchers,coalesce((p->>'planned_date')::date,hr.today())) returning * into t;
    insert into hr.task_events(task_id,actor_id,event_type,after_data,task_version) values(t.id,e.id,'created',to_jsonb(t),t.version);
    perform hr.emit(e.organization_id,t.id||':assigned:1','task.assigned',t.id,e.id,array[target]);
    perform hr.emit(e.organization_id,t.id||':watchers:1','task.watcher',t.id,e.id,watchers);
  else
    select * into t from hr.tasks where id=(p->>'id')::uuid and organization_id=e.organization_id for update;
    if t.id is null or not hr.can_read(t,e) then perform hr.fail('PT404','업무를 찾을 수 없습니다.'); end if;
    old_t := t;
    if action='task.comment' then
      perform hr.only_keys(p,array['id','body']);
      reason := hr.text_value(p,'body',1,10000);
      insert into hr.comments(task_id,author_id,body) values(t.id,e.id,reason) returning id into comment_id;
      insert into hr.task_events(task_id,actor_id,event_type,reason,task_version) values(t.id,e.id,'comment',reason,t.version);
      perform hr.emit(e.organization_id,comment_id||':comment','task.comment',t.id,e.id,t.watcher_ids||array[t.creator_id,t.assignee_id]);
      return jsonb_build_object('id',comment_id);
    end if;
    perform hr.assert_version(t.version,p);
    if action='task.update' then
      perform hr.only_keys(p,array['id','expected_version','title','description','planned_date','watcher_ids']);
      if e.role<>'admin' and e.id not in(t.creator_id,t.assignee_id) then perform hr.fail('PT403','작성자 또는 현재 담당자만 수정할 수 있습니다.'); end if;
      watchers := case when p ? 'watcher_ids' then array(select distinct value::uuid from jsonb_array_elements_text(p->'watcher_ids') where value::uuid<>t.assignee_id) else t.watcher_ids end;
      added := array(select x from unnest(watchers) x where not x=any(t.watcher_ids));
      perform hr.employee_check(e.organization_id,added);
      update hr.tasks set title=case when p?'title' then hr.text_value(p,'title',1,150) else title end,
        description=case when p?'description' then hr.text_value(p,'description',0,10000) else description end,
        planned_date=coalesce((p->>'planned_date')::date,planned_date),watcher_ids=watchers,version=version+1,updated_at=now()
      where id=t.id returning * into t;
      perform hr.emit(e.organization_id,t.id||':watchers:'||t.version,'task.watcher',t.id,e.id,added);
    elsif action='task.status' then
      perform hr.only_keys(p,array['id','expected_version','status','reason']);
      if e.role<>'admin' and e.id<>t.assignee_id then perform hr.fail('PT403','현재 담당자 또는 관리자만 상태를 바꿀 수 있습니다.'); end if;
      new_status := p->>'status';
      if new_status is null or new_status not in ('ready','doing','done','cancelled') or new_status=t.status or (t.status in ('done','cancelled') and new_status in ('done','cancelled')) then perform hr.fail('PT400','허용되지 않는 상태 전환입니다.'); end if;
      reason := hr.text_value(p,'reason',case when new_status='cancelled' or t.status in ('done','cancelled') then 1 else 0 end,1000);
      update hr.tasks set status=new_status,completed_at=case when new_status='done' then now() end,
        cancelled_at=case when new_status='cancelled' then now() end,version=version+1,updated_at=now() where id=t.id returning * into t;
      perform hr.emit(e.organization_id,t.id||':status:'||t.version,'task.status',t.id,e.id,t.watcher_ids||array[t.creator_id,t.assignee_id]);
    elsif action='task.transfer' then
      perform hr.only_keys(p,array['id','expected_version','new_assignee_id','handover_note']);
      if e.role<>'admin' and e.id<>t.assignee_id then perform hr.fail('PT403','현재 담당자 또는 관리자만 이관할 수 있습니다.'); end if;
      target := (p->>'new_assignee_id')::uuid;
      if target is null or target=t.assignee_id or t.status in ('done','cancelled') then perform hr.fail('PT400','진행할 업무를 다른 활성 직원에게 이관해 주세요. 완료·취소 업무는 먼저 재개해 주세요.'); end if;
      perform hr.employee_check(e.organization_id,array[target]);
      reason := hr.text_value(p,'handover_note',1,2000);
      watchers := array(select distinct x from unnest(t.watcher_ids||t.assignee_id) x where x<>target);
      update hr.tasks set assignee_id=target,watcher_ids=watchers,version=version+1,updated_at=now() where id=t.id returning * into t;
      perform hr.emit(e.organization_id,t.id||':transfer:'||t.version,'task.transfer',t.id,e.id,t.watcher_ids||array[t.creator_id,t.assignee_id]);
    else perform hr.fail('PT400','지원하지 않는 업무 명령입니다.'); end if;
    insert into hr.task_events(task_id,actor_id,event_type,before_data,after_data,reason,task_version)
    values(t.id,e.id,action,to_jsonb(old_t),to_jsonb(t),coalesce(reason,''),t.version);
  end if;
  perform hr.log(e,'task',t.id,action,case when old_t.id is not null then to_jsonb(old_t) end,to_jsonb(t),coalesce(reason,''));
  return to_jsonb(t);
end $$;


ALTER FUNCTION "hr"."task_command"("e" "hr"."employees", "action" "text", "p" "jsonb") OWNER TO "postgres";

--
-- Name: task_json("hr"."tasks"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."task_json"("t" "hr"."tasks") RETURNS "jsonb"
    LANGUAGE "sql" STABLE
    AS $$
  select to_jsonb(t)||jsonb_build_object('task_key','TASK-'||t.task_number,'assignee_name',(select name from hr.employees where id=t.assignee_id),
    'creator_name',(select name from hr.employees where id=t.creator_id),'watchers',coalesce((select jsonb_agg(jsonb_build_object('id',id,'name',name)) from hr.employees where id=any(t.watcher_ids)),'[]'))
$$;


ALTER FUNCTION "hr"."task_json"("t" "hr"."tasks") OWNER TO "postgres";

--
-- Name: text_value("jsonb", "text", integer, integer); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."text_value"("p" "jsonb", "k" "text", "min_len" integer, "max_len" integer) RETURNS "text"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare v text := btrim(coalesce(p->>k,''));
begin
  if jsonb_typeof(p->k) not in ('string','null') or length(v)<min_len or length(v)>max_len then
    perform hr.fail('PT400',k||': '||min_len||'~'||max_len||'자로 입력해 주세요.');
  end if;
  return v;
end $$;


ALTER FUNCTION "hr"."text_value"("p" "jsonb", "k" "text", "min_len" integer, "max_len" integer) OWNER TO "postgres";

--
-- Name: today(); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."today"() RETURNS "date"
    LANGUAGE "sql" STABLE
    AS $$ select (now() at time zone 'Asia/Seoul')::date $$;


ALTER FUNCTION "hr"."today"() OWNER TO "postgres";

--
-- Name: today_tasks("hr"."employees", "date"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."today_tasks"("e" "hr"."employees", "d" "date") RETURNS SETOF "hr"."tasks"
    LANGUAGE "sql" STABLE
    AS $$
  with selected_ids as (
    select t.id from hr.tasks t where t.organization_id=e.organization_id and t.assignee_id=e.id
      and ((t.planned_date<=d and t.status in ('ready','doing')) or t.planned_date=d)
    union
    select x.task_id from hr.task_events x where x.actor_id=e.id and x.created_at>=hr.at_day(d,0) and x.created_at<hr.at_day(d+1,0)
  )
  select t.* from selected_ids selected join hr.tasks t on t.id=selected.id where t.organization_id=e.organization_id and hr.can_read(t,e) order by t.updated_at desc
$$;


ALTER FUNCTION "hr"."today_tasks"("e" "hr"."employees", "d" "date") OWNER TO "postgres";

--
-- Name: validate_policy("jsonb"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."validate_policy"("c" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
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


ALTER FUNCTION "hr"."validate_policy"("c" "jsonb") OWNER TO "postgres";

--
-- Name: work_intervals("jsonb", "date"); Type: FUNCTION; Schema: hr; Owner: postgres
--

CREATE FUNCTION "hr"."work_intervals"("c" "jsonb", "d" "date") RETURNS "int4multirange"
    LANGUAGE "plpgsql" IMMUTABLE
    AS $$
declare spans int4multirange; b jsonb;
begin
  if not (c->'weekdays') @> to_jsonb(extract(isodow from d)::integer) or exists(select 1 from jsonb_array_elements(c->'holidays') h where h->>'date'=d::text) then return '{}'::int4multirange; end if;
  spans := int4multirange(int4range((c->>'start')::integer,(c->>'end')::integer,'[)'));
  for b in select * from jsonb_array_elements(c->'breaks') loop spans := spans-int4multirange(int4range((b->>0)::integer,(b->>1)::integer,'[)')); end loop;
  return spans;
end $$;


ALTER FUNCTION "hr"."work_intervals"("c" "jsonb", "d" "date") OWNER TO "postgres";

--
-- Name: assert_admin("uuid", "uuid"); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION "personnel_private"."assert_admin"("w" "uuid", "a" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  if not exists(select 1 from public.workspace_members m join auth.users u on u.id=m.user_id where m.workspace_id=w and m.user_id=a
    and (m.role::text='super_admin' or lower(btrim(u.email))='resumet@gmail.com'))
    or exists(select 1 from personnel_private.employees where workspace_id=w and user_id=a and status<>'employed') then
    raise sqlstate 'PT403' using message='최고관리자만 임직원 정보를 관리할 수 있습니다.';
  end if;
end $$;


ALTER FUNCTION "personnel_private"."assert_admin"("w" "uuid", "a" "uuid") OWNER TO "postgres";

--
-- Name: guard_leave(); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION "personnel_private"."guard_leave"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from public.workspaces where id=new.workspace_id for update;
  if not public.personnel_access(new.workspace_id,new.user_id) then raise sqlstate 'PT403' using message='퇴직한 직원은 새 근태 기록을 등록할 수 없습니다.'; end if;
  return new;
end $$;


ALTER FUNCTION "personnel_private"."guard_leave"() OWNER TO "postgres";

--
-- Name: guard_task(); Type: FUNCTION; Schema: personnel_private; Owner: postgres
--

CREATE FUNCTION "personnel_private"."guard_task"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
begin
  perform 1 from public.workspaces where id=new.workspace_id for update;
  if new.status='open' and not public.personnel_access(new.workspace_id,new.assignee_id) then raise sqlstate 'PT409' using message='퇴직한 직원에게 업무를 배정할 수 없습니다.'; end if;
  return new;
end $$;


ALTER FUNCTION "personnel_private"."guard_task"() OWNER TO "postgres";

--
-- Name: apply_message_provider_batch_results("uuid", "jsonb", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job_kind text;
  v_updated integer := 0;
begin
  select job_kind
  into v_job_kind
  from public.message_provider_batches
  where id = p_batch_id;

  if v_job_kind is null then
    raise exception 'Message provider batch not found: %', p_batch_id;
  end if;

  if v_job_kind = 'roster' then
    update public.message_recipients recipient
    set
      status = case
        when result.state = 'success' then 'success'
        when result.state = 'failed' then 'failed'
        else 'unknown'
      end,
      provider_status = result.provider_status,
      provider_result_code = result.result_code,
      provider_result_message = result.result_message,
      final_message_type = result.final_message_type,
      provider_correlation_id = coalesce(recipient.provider_correlation_id, result.correlation_id),
      failure_reason = case when result.state = 'failed' then result.result_message else null end,
      delivery_checked_at = p_checked_at,
      completed_at = case when result.terminal then p_checked_at else null end
    from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as result(
      seq integer,
      state text,
      terminal boolean,
      provider_status text,
      result_code text,
      result_message text,
      final_message_type text,
      correlation_id text
    )
    where recipient.provider_batch_id = p_batch_id
      and recipient.provider_seq = result.seq;
    get diagnostics v_updated = row_count;
  else
    update public.address_book_message_recipients recipient
    set
      status = case
        when result.state = 'success' then 'success'
        when result.state = 'failed' then 'failed'
        else 'unknown'
      end,
      provider_status = result.provider_status,
      provider_result_code = result.result_code,
      provider_result_message = result.result_message,
      final_message_type = result.final_message_type,
      provider_correlation_id = coalesce(recipient.provider_correlation_id, result.correlation_id),
      failure_reason = case when result.state = 'failed' then result.result_message else null end,
      delivery_checked_at = p_checked_at,
      completed_at = case when result.terminal then p_checked_at else null end
    from jsonb_to_recordset(coalesce(p_results, '[]'::jsonb)) as result(
      seq integer,
      state text,
      terminal boolean,
      provider_status text,
      result_code text,
      result_message text,
      final_message_type text,
      correlation_id text
    )
    where recipient.provider_batch_id = p_batch_id
      and recipient.provider_seq = result.seq;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;


ALTER FUNCTION "public"."apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone) OWNER TO "postgres";

--
-- Name: apply_paid_roster_changes("uuid", "uuid", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."apply_paid_roster_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_course public.courses%rowtype; v_job public.course_jobs%rowtype;
  v_version integer; v_job_id uuid; v_change jsonb;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then raise exception '유료수강생 명단을 관리할 권한이 없습니다.'; end if;
  select * into v_job from public.course_jobs where course_id = p_course_id and is_order_roster for update;
  perform 1 from public.course_orders where course_id = p_course_id for update;
  perform 1 from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version for update;
  if public.paid_roster_snapshot(p_course_id, p_actor_id) is distinct from p_snapshot then
    raise exception '주문 또는 수강생 정보가 변경되었습니다. 미리보기를 다시 열어 확인해 주세요.';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 10000 then
    raise exception '반영할 항목을 선택해 주세요.';
  end if;
  -- All operations are recomputed by the authenticated API, never taken from client values.
  for v_change in select value from jsonb_array_elements(p_changes) loop
    if not exists (select 1 from public.course_orders where course_id = p_course_id and id = (v_change->>'orderId')::uuid
      and regexp_replace(normalize(status, NFKC), '\s', '', 'g') = '결제완료') then
      raise exception '선택한 결제완료 주문을 확인해 주세요.';
    end if;
    if v_change->>'targetId' is not null and not exists (select 1 from public.job_enrollments
      where id = (v_change->>'targetId')::uuid and job_id = v_job.id and version = v_job.latest_version) then
      raise exception '변경할 수강생을 확인해 주세요.';
    end if;
    if exists (select 1 from jsonb_array_elements_text(v_change->'removeIds') r where not exists
      (select 1 from public.job_enrollments where id = r.value::uuid and job_id = v_job.id and version = v_job.latest_version)) then
      raise exception '중복 정리 대상을 확인해 주세요.';
    end if;
  end loop;
  if v_job.id is null then
    insert into public.course_jobs(workspace_id, course_id, name, default_course_name, status, latest_version, created_by, is_order_roster)
      values (v_course.workspace_id, p_course_id, v_course.name || ' 유료수강생', v_course.name, 'ready', 0, p_actor_id, true)
      returning * into v_job;
  end if;
  v_job_id := v_job.id; v_version := v_job.latest_version + 1;
  with operations as (
    select (c->>'orderId')::uuid order_id, (c->>'targetId')::uuid target_id, c->'removeIds' remove_ids
    from jsonb_array_elements(p_changes) c
  ), chosen as (
    select o.*, op.target_id, regexp_replace(regexp_replace(normalize(o.phone, NFKC), '[^0-9]', '', 'g'), '^(0082|82)', '') as digits
    from operations op join public.course_orders o on o.id = op.order_id and o.course_id = p_course_id
  ), mapped as (
    select *, case when digits like '10%' then '0' || digits else digits end as normalized_phone,
      jsonb_build_object('optionName', option_name, 'paymentAmount', payment_amount::text, 'orderRecordKey', record_key) as patch,
      jsonb_build_object('옵션명', option_name, '결제금액', payment_amount::text) as original_patch
    from chosen
  ), existing as (
    select * from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version
  ), combined as (
    select e.source_row_number as position, e.student_id, e.normalized_phone as phone,
      e.normalized_values || coalesce(m.patch, '{}'::jsonb) as vals,
      e.original_values || coalesce(m.original_patch, '{}'::jsonb) as original,
      e.is_extra_participant, e.is_manually_added
    from existing e left join mapped m on m.target_id = e.id
    where not exists (select 1 from operations op, jsonb_array_elements_text(op.remove_ids) r where r.value = e.id::text)
    union all
    select (select coalesce(max(source_row_number), 1) from existing) + row_number() over(order by m.record_key),
      null::uuid, m.normalized_phone,
      m.patch || jsonb_build_object('courseName', v_course.name, 'customerName', m.member_name,
        'phone', m.normalized_phone, 'email', m.email, 'referrer', m.rs, 'source', m.rs, 'adMedia', m.ad_media,
        'rs', m.rs, 'paymentMethod', m.payment_method, 'paymentId', m.payment_id, 'groupChatJoined', false, 'memo', ''),
      m.original_patch || jsonb_build_object('이름', m.member_name, '연락처', m.phone, '이메일', m.email,
        'RS', m.rs, '결제방법', m.payment_method, '결제ID', m.payment_id), false, false
    from mapped m where m.target_id is null
  )
  insert into public.job_enrollments(job_id, version, student_id, normalized_phone, normalized_values, original_values,
    source_row_number, is_duplicate, is_extra_participant, is_manually_added)
  select v_job.id, v_version, student_id, phone, vals, original, row_number() over(order by position) + 1,
    coalesce(phone, '') <> '' and count(*) over(partition by phone) > 1, is_extra_participant, is_manually_added
  from combined;
  update public.course_jobs set latest_version = v_version,
    valid_count = (select count(*) from public.job_enrollments where job_id = v_job.id and version = v_version),
    default_course_name = v_course.name, status = 'ready', updated_at = now() where id = v_job.id;
  insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
    values(v_course.workspace_id, p_actor_id, 'course_job.orders_reconciled', 'course_job', v_job.id,
      jsonb_build_object('version', v_version, 'changes', p_changes));
  return v_job_id;
end;
$$;


ALTER FUNCTION "public"."apply_paid_roster_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") OWNER TO "postgres";

--
-- Name: apply_paid_roster_review("uuid", "uuid", "jsonb", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."apply_paid_roster_review"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_course public.courses%rowtype; v_job public.course_jobs%rowtype;
  v_change jsonb; v_row public.job_enrollments%rowtype; v_regular jsonb;
  v_ids uuid[] := array[]::uuid[]; v_target uuid; v_result uuid;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then raise exception '유료수강생 명단을 관리할 권한이 없습니다.'; end if;
  select * into v_job from public.course_jobs where course_id = p_course_id and is_order_roster for update;
  perform 1 from public.course_orders where course_id = p_course_id for update;
  perform 1 from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version for update;
  if public.paid_roster_snapshot(p_course_id, p_actor_id) is distinct from p_snapshot then
    raise exception '주문 또는 수강생 정보가 변경되었습니다. 미리보기를 다시 열어 확인해 주세요.';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) not between 1 and 10000 then
    raise exception '반영할 항목을 선택해 주세요.';
  end if;
  select coalesce(jsonb_agg(c), '[]'::jsonb) into v_regular from jsonb_array_elements(p_changes) c
    where coalesce(c->>'kind', '') <> 'remove';
  for v_change in select value from jsonb_array_elements(p_changes) where value->>'kind' = 'remove' loop
    v_target := (v_change->>'targetId')::uuid;
    select * into v_row from public.job_enrollments where id = v_target and job_id = v_job.id and version = v_job.latest_version;
    if v_row.id is null or v_target = any(v_ids) or v_row.is_manually_added
      or coalesce(v_row.normalized_values->>'refundedAt', '') <> ''
      or coalesce(v_row.normalized_values->>'orderRecordKey', '') = '' then
      raise exception '제외할 수강생을 다시 확인해 주세요.';
    end if;
    -- A present order must explicitly be cancelled/refunded with no remaining payment.
    if exists (select 1 from public.course_orders o where o.course_id = p_course_id
      and o.record_key = v_row.normalized_values->>'orderRecordKey'
      and not (o.current_amount = 0 and normalize(o.status, NFKC) ~ '(취소|환불)')) then
      raise exception '취소·환불되지 않은 주문은 제외할 수 없습니다.';
    end if;
    if exists (select 1 from jsonb_array_elements(v_regular) c where c->>'targetId' = v_target::text
      or (c->'removeIds') @> jsonb_build_array(v_target::text)) then
      raise exception '갱신 대상과 제외 대상이 겹칩니다. 미리보기를 다시 확인해 주세요.';
    end if;
    v_ids := array_append(v_ids, v_target);
  end loop;
  -- Nothing is modified until every approved exclusion has passed validation.
  update public.job_enrollments set normalized_values = normalized_values || jsonb_build_object(
    'refundedAt', now(), 'refundedBy', p_actor_id, 'refundSource', 'order_roster_review'
  ) where id = any(v_ids) and job_id = v_job.id and version = v_job.latest_version;
  v_result := v_job.id;
  if jsonb_array_length(v_regular) > 0 then
    -- Existing reconciliation carries the archive flags and all prior data to the new version.
    v_result := public.apply_paid_roster_changes(p_course_id, p_actor_id,
      public.paid_roster_snapshot(p_course_id, p_actor_id), v_regular);
  end if;
  if cardinality(v_ids) > 0 then
    insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
      values(v_course.workspace_id, p_actor_id, 'course_job.order_removals_approved', 'course_job', v_job.id,
        jsonb_build_object('version', v_job.latest_version, 'enrollmentIds', to_jsonb(v_ids), 'changes', p_changes));
  end if;
  return v_result;
end;
$$;


ALTER FUNCTION "public"."apply_paid_roster_review"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") OWNER TO "postgres";

--
-- Name: assign_message_provider_batch_recipients("uuid", "jsonb", timestamp with time zone); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone DEFAULT "now"()) RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_job_kind text;
  v_message_job_id uuid;
  v_address_message_job_id uuid;
  v_updated integer := 0;
begin
  select job_kind, message_job_id, address_book_message_job_id
  into v_job_kind, v_message_job_id, v_address_message_job_id
  from public.message_provider_batches
  where id = p_batch_id;

  if v_job_kind is null then
    raise exception 'Message provider batch not found: %', p_batch_id;
  end if;

  if v_job_kind = 'roster' then
    update public.message_recipients recipient
    set
      provider_batch_id = p_batch_id,
      provider_seq = mapping.seq,
      status = 'unknown',
      requested_at = coalesce(recipient.requested_at, p_requested_at)
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as mapping(
      id uuid,
      seq integer
    )
    where recipient.id = mapping.id
      and recipient.message_job_id = v_message_job_id;
    get diagnostics v_updated = row_count;
  else
    update public.address_book_message_recipients recipient
    set
      provider_batch_id = p_batch_id,
      provider_seq = mapping.seq,
      status = 'unknown',
      requested_at = coalesce(recipient.requested_at, p_requested_at)
    from jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) as mapping(
      id uuid,
      seq integer
    )
    where recipient.id = mapping.id
      and recipient.message_job_id = v_address_message_job_id;
    get diagnostics v_updated = row_count;
  end if;

  return v_updated;
end;
$$;


ALTER FUNCTION "public"."assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone) OWNER TO "postgres";

--
-- Name: check_paid_roster_workspace(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."check_paid_roster_workspace"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
begin
  if new.is_order_roster and new.course_id is not null and not exists (
    select 1 from public.courses where id = new.course_id and workspace_id = new.workspace_id
  ) then raise exception '강의와 명단의 워크스페이스가 일치해야 합니다.'; end if;
  return new;
end;
$$;


ALTER FUNCTION "public"."check_paid_roster_workspace"() OWNER TO "postgres";

--
-- Name: message_provider_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_provider_batches" (
    "id" "uuid" NOT NULL,
    "job_kind" "text" NOT NULL,
    "message_job_id" "uuid",
    "address_book_message_job_id" "uuid",
    "provider" "text" DEFAULT 'directalk'::"text" NOT NULL,
    "chunk_index" integer NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "recipient_count" integer NOT NULL,
    "success_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "http_status" integer,
    "group_id" "text",
    "provider_status" "text",
    "provider_correlation_id" "text",
    "failure_reason" "text",
    "sync_started_at" timestamp with time zone,
    "submitted_at" timestamp with time zone,
    "delivery_checked_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_provider_batches_check" CHECK (((("job_kind" = 'roster'::"text") AND ("message_job_id" IS NOT NULL) AND ("address_book_message_job_id" IS NULL)) OR (("job_kind" = 'address-book'::"text") AND ("message_job_id" IS NULL) AND ("address_book_message_job_id" IS NOT NULL)))),
    CONSTRAINT "message_provider_batches_chunk_index_check" CHECK (("chunk_index" >= 0)),
    CONSTRAINT "message_provider_batches_job_kind_check" CHECK (("job_kind" = ANY (ARRAY['roster'::"text", 'address-book'::"text"]))),
    CONSTRAINT "message_provider_batches_recipient_count_check" CHECK (("recipient_count" > 0)),
    CONSTRAINT "message_provider_batches_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'submitted'::"text", 'processing'::"text", 'completed'::"text", 'partial_failed'::"text", 'failed'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."message_provider_batches" OWNER TO "postgres";

--
-- Name: claim_message_provider_batches("text", "uuid", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer DEFAULT 10) RETURNS SETOF "public"."message_provider_batches"
    LANGUAGE "sql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  with candidates as (
    select batch.id
    from public.message_provider_batches batch
    where batch.job_kind = p_job_kind
      and (
        (p_job_kind = 'roster' and batch.message_job_id = p_job_id)
        or
        (p_job_kind = 'address-book' and batch.address_book_message_job_id = p_job_id)
      )
      and batch.status not in ('completed', 'partial_failed', 'failed')
      and (
        batch.submitted_at is null
        or batch.submitted_at < now() - interval '5 seconds'
      )
      and (
        batch.delivery_checked_at is null
        or batch.delivery_checked_at < now() - interval '5 seconds'
      )
      and (
        batch.sync_started_at is null
        or batch.sync_started_at < now() - interval '5 minutes'
      )
    order by batch.chunk_index
    limit greatest(1, least(coalesce(p_limit, 10), 50))
    for update skip locked
  )
  update public.message_provider_batches batch
  set sync_started_at = now()
  from candidates
  where batch.id = candidates.id
  returning batch.*;
$$;


ALTER FUNCTION "public"."claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer) OWNER TO "postgres";

--
-- Name: create_work_task_with_event("uuid", "text", "text", "date", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."create_work_task_with_event"("p_workspace_id" "uuid", "p_title" "text", "p_description" "text", "p_planned_date" "date", "p_creator_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  created_task public.work_tasks;
begin
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_creator_id
  ) then
    raise exception 'CREATOR_NOT_IN_WORKSPACE';
  end if;

  insert into public.work_tasks (
    workspace_id, title, description, planned_date, creator_id, assignee_id
  ) values (
    p_workspace_id, p_title, p_description, p_planned_date, p_creator_id, p_creator_id
  ) returning * into created_task;

  insert into public.work_task_events (
    task_id, actor_id, event_type, to_assignee_id, metadata
  ) values (
    created_task.id,
    p_creator_id,
    'created',
    p_creator_id,
    jsonb_build_object('title', p_title, 'plannedDate', p_planned_date)
  );

  return to_jsonb(created_task);
end;
$$;


ALTER FUNCTION "public"."create_work_task_with_event"("p_workspace_id" "uuid", "p_title" "text", "p_description" "text", "p_planned_date" "date", "p_creator_id" "uuid") OWNER TO "postgres";

--
-- Name: edit_work_task_with_event("uuid", "uuid", "uuid", "text", "text", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."edit_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_title" "text", "p_description" "text", "p_is_admin" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  current_task public.work_tasks;
  changed_task public.work_tasks;
begin
  select * into current_task
  from public.work_tasks
  where id = p_task_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if not p_is_admin and current_task.assignee_id <> p_actor_id then
    raise exception 'TASK_ACCESS_DENIED';
  end if;

  update public.work_tasks
  set title = p_title, description = p_description, updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (task_id, actor_id, event_type, metadata)
  values (
    p_task_id,
    p_actor_id,
    'edited',
    jsonb_build_object(
      'previousTitle', current_task.title,
      'title', p_title,
      'previousDescription', current_task.description,
      'description', p_description
    )
  );

  return to_jsonb(changed_task);
end;
$$;


ALTER FUNCTION "public"."edit_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_title" "text", "p_description" "text", "p_is_admin" boolean) OWNER TO "postgres";

--
-- Name: handle_new_user(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  shared_workspace_id uuid;
begin
  select w.id
    into shared_workspace_id
  from public.workspaces w
  where w.is_primary
  limit 1;

  if shared_workspace_id is null then
    insert into public.workspaces (name, is_primary)
    values (
      coalesce(
        new.raw_user_meta_data ->> 'workspace_name',
        split_part(new.email, '@', 1) || ' 워크스페이스'
      ),
      true
    )
    returning id into shared_workspace_id;
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (
    shared_workspace_id,
    new.id,
    case
      when lower(new.email) = 'resumet@gmail.com' then 'super_admin'::public.app_role
      else 'user'::public.app_role
    end
  );

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";

--
-- Name: hr_bootstrap("uuid", "text", "date", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_bootstrap"("p_auth_id" "uuid", "p_name" "text", "p_start_date" "date", "p_organization_name" "text" DEFAULT 'HR & Work Dashboard'::"text") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE org uuid; email_address text;
BEGIN
  PERFORM pg_advisory_xact_lock(74219301);
  IF EXISTS(SELECT 1 FROM hr.organizations) THEN PERFORM hr.fail('PT409','HR 초기 설정이 이미 완료되었습니다.'); END IF;
  SELECT lower(email) INTO email_address FROM auth.users WHERE id=p_auth_id;
  IF email_address IS NULL THEN PERFORM hr.fail('PT400','인증 계정을 먼저 생성해 주세요.'); END IF;
  INSERT INTO hr.organizations(name) VALUES(p_organization_name) RETURNING id INTO org;
  INSERT INTO hr.employees(organization_id,auth_id,email,name,role,employment_start_date) VALUES(org,p_auth_id,email_address,p_name,'admin',p_start_date);
  INSERT INTO hr.policies(organization_id,effective_from,version,config) VALUES(org,'1900-01-01',1,
    '{"weekdays":[1,2,3,4,5],"start":540,"end":1080,"breaks":[[720,780]],"split":840,"grace":0,"holidays":[]}');
  PERFORM hr.sync_all_work_accounts();
  RETURN org;
END $$;


ALTER FUNCTION "public"."hr_bootstrap"("p_auth_id" "uuid", "p_name" "text", "p_start_date" "date", "p_organization_name" "text") OWNER TO "postgres";

--
-- Name: hr_claim_invitation("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_claim_invitation"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE invitation hr.invitations; existing_id uuid;
BEGIN
  SELECT * INTO invitation FROM hr.invitations WHERE id=p_id;
  IF invitation.id IS NULL THEN PERFORM hr.fail('PT404','초대 기록이 없습니다.'); END IF;
  PERFORM 1 FROM hr.organizations WHERE id=invitation.organization_id FOR UPDATE;
  SELECT * INTO invitation FROM hr.invitations WHERE id=p_id FOR UPDATE;
  IF invitation.auth_deleted_at IS NOT NULL THEN PERFORM hr.fail('PT409','삭제된 계정의 초대입니다. 새 초대를 생성해 주세요.'); END IF;
  IF invitation.status<>'pending' THEN RETURN jsonb_build_object('claimed',false,'status',invitation.status); END IF;
  IF NOT EXISTS(SELECT 1 FROM hr.employees WHERE id=invitation.invited_by AND active AND role='admin') THEN PERFORM hr.fail('PT403','초대 관리자 권한을 확인해 주세요.'); END IF;
  SELECT id INTO existing_id FROM auth.users u WHERE lower(email)=invitation.email AND to_jsonb(u)->>'deleted_at' IS NULL;
  UPDATE hr.invitations SET status='sending' WHERE id=p_id;
  RETURN jsonb_build_object('claimed',true,'email',invitation.email,'existing_auth_id',existing_id);
END $$;


ALTER FUNCTION "public"."hr_claim_invitation"("p_id" "uuid") OWNER TO "postgres";

--
-- Name: hr_command("text", "jsonb", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_command"("p_action" "text", "p_body" "jsonb", "p_key" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."hr_command"("p_action" "text", "p_body" "jsonb", "p_key" "uuid") OWNER TO "postgres";

--
-- Name: hr_finish_invitation("uuid", "uuid", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_finish_invitation"("p_id" "uuid", "p_auth_id" "uuid", "p_success" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE invitation hr.invitations; employee hr.employees;
BEGIN
  SELECT * INTO invitation FROM hr.invitations WHERE id=p_id;
  IF invitation.id IS NULL THEN PERFORM hr.fail('PT404','초대 기록이 없습니다.'); END IF;
  PERFORM 1 FROM hr.organizations WHERE id=invitation.organization_id FOR UPDATE;
  SELECT * INTO invitation FROM hr.invitations WHERE id=p_id FOR UPDATE;
  IF invitation.status='sent' THEN RETURN jsonb_build_object('status','sent'); END IF;
  IF invitation.auth_deleted_at IS NOT NULL THEN PERFORM hr.fail('PT409','삭제된 계정의 초대입니다. 새 초대를 생성해 주세요.'); END IF;
  IF p_success THEN
    IF NOT EXISTS(SELECT 1 FROM auth.users u WHERE id=p_auth_id AND lower(email)=invitation.email AND to_jsonb(u)->>'deleted_at' IS NULL) THEN PERFORM hr.fail('PT400','초대 이메일과 인증 계정이 일치하지 않습니다.'); END IF;
    IF NOT EXISTS(SELECT 1 FROM hr.employees WHERE id=invitation.invited_by AND active AND role='admin') THEN PERFORM hr.fail('PT403','초대 관리자 권한을 다시 확인해 주세요.'); END IF;
    PERFORM hr.sync_work_account(p_auth_id);
    SELECT * INTO employee FROM hr.employees WHERE organization_id=invitation.organization_id AND auth_id=p_auth_id AND email=invitation.email;
    IF employee.id IS NULL THEN PERFORM hr.fail('PT409','같은 이메일의 기존 직원 연결 상태를 확인해 주세요.'); END IF;
    UPDATE hr.invitations SET status='sent',auth_id=p_auth_id WHERE id=p_id;
    RETURN to_jsonb(employee);
  END IF;
  UPDATE hr.invitations SET status='failed' WHERE id=p_id;
  RETURN jsonb_build_object('status','failed');
END $$;


ALTER FUNCTION "public"."hr_finish_invitation"("p_id" "uuid", "p_auth_id" "uuid", "p_success" boolean) OWNER TO "postgres";

--
-- Name: hr_generate_reminders(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_generate_reminders"() RETURNS integer
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."hr_generate_reminders"() OWNER TO "postgres";

--
-- Name: hr_personnel_query("uuid", integer, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_personnel_query"("p_id" "uuid" DEFAULT NULL::"uuid", "p_page" integer DEFAULT 0, "p_status" "text" DEFAULT 'all'::"text", "p_q" "text" DEFAULT ''::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
declare actor hr.employees:=hr.personnel_actor(); person hr.employees; result jsonb;
begin
  if p_page is null or p_page<0 or p_page>100000 or p_status is null or p_status not in ('all','employed','resigned','dismissed','inactive') or length(p_q)>150 then
    perform hr.fail('PT400','조회 조건을 확인해 주세요.');
  end if;
  if p_id is null then
    with people as (
      select e.id,e.name,e.email,e.department,e.active,e.employment_start_date,e.employment_end_date,
        case when e.active then 'employed' else coalesce(nullif(p.status,'employed'),'inactive') end as status
      from hr.employees e left join hr.personnel p on p.employee_id=e.id
      where e.organization_id=actor.organization_id and (coalesce(p_q,'')='' or e.name ilike '%'||p_q||'%' or e.email ilike '%'||p_q||'%')
    ), filtered as (select * from people where p_status='all' or status=p_status)
    select jsonb_build_object('items',coalesce((select jsonb_agg(x) from (select * from filtered order by active desc,name,id limit 50 offset p_page*50) x),'[]'),'total',(select count(*) from filtered)) into result;
    return result;
  end if;
  select * into person from hr.employees where id=p_id and organization_id=actor.organization_id;
  if person.id is null then perform hr.fail('PT404','직원을 찾을 수 없습니다.'); end if;
  return jsonb_build_object('employee',to_jsonb(person),'profile',(select to_jsonb(p) from hr.personnel p where employee_id=p_id),
    'events',coalesce((select jsonb_agg(x) from (select ev.*,a.name actor_name from hr.personnel_events ev join hr.employees a on a.id=ev.actor_id where ev.employee_id=p_id order by ev.created_at desc limit 100) x),'[]'),
    'leave',jsonb_build_object('year',extract(year from hr.today()),
      'used',(select count(*)*0.5 from hr.leave_days where employee_id=p_id and active and day between date_trunc('year',hr.today())::date and hr.today()),
      'planned',(select count(*)*0.5 from hr.leave_days where employee_id=p_id and active and day>hr.today() and day<(date_trunc('year',hr.today())+interval '1 year')::date),
      'items',coalesce((select jsonb_agg(x) from (select id,start_date,end_date,unit,status from hr.leaves where employee_id=p_id order by start_date desc,id limit 100) x),'[]')));
end $$;


ALTER FUNCTION "public"."hr_personnel_query"("p_id" "uuid", "p_page" integer, "p_status" "text", "p_q" "text") OWNER TO "postgres";

--
-- Name: hr_personnel_save("jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_personnel_save"("p" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $_$
declare actor hr.employees:=hr.personnel_actor(); person hr.employees; profile hr.personnel;
  action text:=p->>'action'; start_day date:=(p->>'employment_start_date')::date;
  event_day date:=(p->>'effective_date')::date; account_id uuid; address_email text;
begin
  perform 1 from hr.organizations where id=actor.organization_id for update;
  actor:=hr.personnel_actor();
  if action is null or action not in ('hire','update','rehire','resign','dismiss') or start_day is null or event_day is null then perform hr.fail('PT400','인사 처리 항목을 확인해 주세요.'); end if;
  perform hr.text_value(p,'reason',1,2000);
  if nullif(p->>'contract_end_date','')::date<start_day then perform hr.fail('PT400','계약 종료일은 입사일 이후여야 합니다.'); end if;
  if action='hire' then
    address_email:=lower(hr.text_value(p,'email',3,254));
    if address_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then perform hr.fail('PT400','이메일을 확인해 주세요.'); end if;
    if exists(select 1 from hr.employees where organization_id=actor.organization_id and email=address_email and auth_deleted_at is null) then perform hr.fail('PT409','이미 등록된 계정입니다. 기존 직원 정보를 선택해 주세요.'); end if;
    select id into account_id from auth.users where lower(email)=address_email;
    if exists(select 1 from hr.employees where auth_id=account_id) then perform hr.fail('PT409','이미 연결된 계정입니다.'); end if;
    insert into hr.employees(organization_id,auth_id,email,name,department,employment_start_date)
      values(actor.organization_id,account_id,address_email,hr.text_value(p,'name',1,100),hr.text_value(p,'department',0,100),start_day) returning * into person;
  else
    select * into person from hr.employees where id=(p->>'id')::uuid and organization_id=actor.organization_id for update;
    if person.id is null then perform hr.fail('PT404','직원을 찾을 수 없습니다.'); end if;
    if person.version is distinct from (p->>'expected_version')::integer then perform hr.fail('PT409','다른 변경이 있습니다. 다시 불러온 후 저장해 주세요.'); end if;
    select * into profile from hr.personnel where employee_id=person.id;
    if coalesce(profile.version,0) is distinct from (p->>'profile_version')::integer then perform hr.fail('PT409','신상정보가 변경되었습니다. 다시 불러와 주세요.'); end if;
    if action in ('resign','dismiss') and (not person.active or event_day<start_day or event_day>hr.today()) then perform hr.fail('PT400','재직 상태와 퇴직일을 확인해 주세요.'); end if;
    if action='rehire' and (person.active or person.auth_deleted_at is not null) then perform hr.fail('PT400','재입사 가능한 직원이 아닙니다.'); end if;
    if person.id=actor.id and action in ('resign','dismiss') then perform hr.fail('PT409','현재 최고관리자 본인을 퇴직 처리할 수 없습니다.'); end if;
    -- Reuse existing task/attendance/history guards, after checking the stronger permission.
    actor.role:='admin';
    perform hr.employee_command(actor,jsonb_build_object('id',person.id,'expected_version',person.version,'name',hr.text_value(p,'name',1,100),
      'department',hr.text_value(p,'department',0,100),'role',person.role,'active',case when action='rehire' then true when action in ('resign','dismiss') then false else person.active end,
      'employment_start_date',start_day,'employment_end_date',case when action in ('resign','dismiss') then event_day else person.employment_end_date end,'reason',p->>'reason'));
  end if;
  if coalesce((p->>'link_account')::boolean,false) and person.auth_id is null then
    if person.auth_deleted_at is not null then perform hr.fail('PT409','삭제된 계정의 기록은 다른 계정에 연결할 수 없습니다.'); end if;
    select id into account_id from auth.users where lower(email)=person.email;
    if account_id is null then perform hr.fail('PT404','같은 이메일의 로그인 계정을 먼저 생성해 주세요.'); end if;
    if exists(select 1 from hr.employees where auth_id=account_id and id<>person.id) then perform hr.fail('PT409','이미 연결된 계정입니다.'); end if;
    update hr.employees set auth_id=account_id,version=version+1 where id=person.id;
  end if;
  insert into hr.personnel(employee_id,address,resident_number_ciphertext,phone,memo,contract_end_date,annual_salary,status)
    values(person.id,hr.text_value(p,'address',0,500),nullif(p->>'resident_number_ciphertext',''),hr.text_value(p,'phone',0,40),hr.text_value(p,'memo',0,10000),
      nullif(p->>'contract_end_date','')::date,(p->>'annual_salary')::bigint,
      case when action='resign' then 'resigned' when action='dismiss' then 'dismissed' when action in ('hire','rehire') or person.active then 'employed' else coalesce(profile.status,'inactive') end)
    on conflict(employee_id) do update set address=excluded.address,phone=excluded.phone,memo=excluded.memo,contract_end_date=excluded.contract_end_date,
      annual_salary=excluded.annual_salary,status=excluded.status,version=hr.personnel.version+1,updated_at=now(),
      resident_number_ciphertext=case when p?'resident_number_ciphertext' then excluded.resident_number_ciphertext else hr.personnel.resident_number_ciphertext end;
  insert into hr.personnel_events(employee_id,actor_id,action,reason,effective_date) values(person.id,actor.id,action,p->>'reason',event_day);
  return person.id;
end $_$;


ALTER FUNCTION "public"."hr_personnel_save"("p" "jsonb") OWNER TO "postgres";

--
-- Name: hr_process_notifications(integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_process_notifications"("p_limit" integer DEFAULT 100) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."hr_process_notifications"("p_limit" integer) OWNER TO "postgres";

--
-- Name: hr_query("text", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_query"("p_resource" "text", "p_filter" "jsonb" DEFAULT '{}'::"jsonb") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."hr_query"("p_resource" "text", "p_filter" "jsonb") OWNER TO "postgres";

--
-- Name: hr_reconcile_invitation("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."hr_reconcile_invitation"("p_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'hr', 'pg_temp'
    AS $$
DECLARE invitation hr.invitations; existing_id uuid;
BEGIN
  SELECT * INTO invitation FROM hr.invitations WHERE id=p_id;
  IF invitation.id IS NULL THEN PERFORM hr.fail('PT404','초대 기록이 없습니다.'); END IF;
  PERFORM 1 FROM hr.organizations WHERE id=invitation.organization_id FOR UPDATE;
  SELECT * INTO invitation FROM hr.invitations WHERE id=p_id FOR UPDATE;
  IF invitation.auth_deleted_at IS NOT NULL THEN PERFORM hr.fail('PT409','삭제된 계정의 초대입니다. 새 초대를 생성해 주세요.'); END IF;
  IF invitation.status='sent' THEN RETURN jsonb_build_object('status','sent'); END IF;
  IF invitation.status IS DISTINCT FROM 'sending' THEN PERFORM hr.fail('PT409','전송 중인 초대만 결과 확인할 수 있습니다.'); END IF;
  SELECT id INTO existing_id FROM auth.users u WHERE lower(email)=invitation.email AND to_jsonb(u)->>'deleted_at' IS NULL;
  IF existing_id IS NULL THEN PERFORM hr.fail('PT409','인증 계정이 아직 확인되지 않습니다. 인증 제공자의 전송 기록을 확인해 주세요.'); END IF;
  RETURN public.hr_finish_invitation(p_id,existing_id,true);
END $$;


ALTER FUNCTION "public"."hr_reconcile_invitation"("p_id" "uuid") OWNER TO "postgres";

--
-- Name: import_course_orders("uuid", "uuid", "text", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."import_course_orders"("p_course_id" "uuid", "p_actor_id" "uuid", "p_file_name" "text", "p_rows" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_workspace_id uuid;
  v_import_id uuid;
begin
  select workspace_id into v_workspace_id from public.courses where id = p_course_id for update;
  if v_workspace_id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_workspace_id and user_id = p_actor_id
  ) then
    raise exception '주문 내역을 관리할 권한이 없습니다.';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception '주문 내역 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(p_rows) < 1 or jsonb_array_length(p_rows) > 10000 then
    raise exception '한 번에 1~10,000건을 저장할 수 있습니다.';
  end if;
  insert into public.course_order_imports(course_id, file_name, row_count, created_by)
  values (p_course_id, p_file_name, jsonb_array_length(p_rows), p_actor_id)
  returning id into v_import_id;

  insert into public.course_orders (
    course_id, record_key, product_name, option_name, member_name, phone, email,
    payment_amount, refund_amount, current_amount, status, payment_method, rs,
    ad_media, inflow_type, payment_id, order_id, refund_date, import_id
  )
  select p_course_id, r.record_key, r.product_name, r.option_name, r.member_name, r.phone, r.email,
    r.payment_amount, r.refund_amount, r.current_amount, r.status, r.payment_method, r.rs,
    r.ad_media, r.inflow_type, r.payment_id, r.order_id, r.refund_date, v_import_id
  from jsonb_to_recordset(p_rows) as r(
    record_key text, product_name text, option_name text, member_name text, phone text, email text,
    payment_amount numeric, refund_amount numeric, current_amount numeric, status text,
    payment_method text, rs text, ad_media text, inflow_type text, payment_id text, order_id text, refund_date date
  )
  on conflict (course_id, record_key) do update set
    product_name = excluded.product_name, option_name = excluded.option_name,
    member_name = excluded.member_name, phone = excluded.phone, email = excluded.email,
    payment_amount = excluded.payment_amount, refund_amount = excluded.refund_amount,
    current_amount = excluded.current_amount, status = excluded.status,
    payment_method = excluded.payment_method, rs = excluded.rs, ad_media = excluded.ad_media,
    inflow_type = excluded.inflow_type, payment_id = excluded.payment_id, order_id = excluded.order_id,
    refund_date = excluded.refund_date, import_id = excluded.import_id, updated_at = now();
  return v_import_id;
end;
$$;


ALTER FUNCTION "public"."import_course_orders"("p_course_id" "uuid", "p_actor_id" "uuid", "p_file_name" "text", "p_rows" "jsonb") OWNER TO "postgres";

--
-- Name: is_workspace_member("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO ''
    AS $$ select exists(select 1 from public.workspace_members m where m.workspace_id = target_workspace and m.user_id = auth.uid()) $$;


ALTER FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") OWNER TO "postgres";

--
-- Name: paid_roster_snapshot("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."paid_roster_snapshot"("p_course_id" "uuid", "p_actor_id" "uuid") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare v_course public.courses%rowtype; v_job public.course_jobs%rowtype;
begin
  select * into v_course from public.courses where id = p_course_id;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then raise exception '유료수강생 명단을 관리할 권한이 없습니다.'; end if;
  select * into v_job from public.course_jobs where course_id = p_course_id and is_order_roster;
  return jsonb_build_object('courseName', v_course.name, 'jobId', v_job.id, 'version', coalesce(v_job.latest_version, 0),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by o.id) from public.course_orders o where course_id = p_course_id), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.job_enrollments e
      where job_id = v_job.id and version = v_job.latest_version), '[]'::jsonb));
end;
$$;


ALTER FUNCTION "public"."paid_roster_snapshot"("p_course_id" "uuid", "p_actor_id" "uuid") OWNER TO "postgres";

--
-- Name: personnel_access("uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."personnel_access"("p_workspace_id" "uuid", "p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
select exists(select 1 from public.workspace_members where workspace_id=p_workspace_id and user_id=p_user_id)
and not exists(select 1 from personnel_private.employees where workspace_id=p_workspace_id and user_id=p_user_id and status<>'employed')
$$;


ALTER FUNCTION "public"."personnel_access"("p_workspace_id" "uuid", "p_user_id" "uuid") OWNER TO "postgres";

--
-- Name: personnel_directory("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."personnel_directory"("p_workspace_id" "uuid") RETURNS "jsonb"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name,'active',status='employed')),'[]') from personnel_private.employees where workspace_id=p_workspace_id and user_id is not null
$$;


ALTER FUNCTION "public"."personnel_directory"("p_workspace_id" "uuid") OWNER TO "postgres";

--
-- Name: personnel_is_active("uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."personnel_is_active"("p_workspace_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$ select public.personnel_access(p_workspace_id,auth.uid()) $$;


ALTER FUNCTION "public"."personnel_is_active"("p_workspace_id" "uuid") OWNER TO "postgres";

--
-- Name: personnel_query("uuid", "uuid", "uuid", integer, "text", "text"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."personnel_query"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid" DEFAULT NULL::"uuid", "p_page" integer DEFAULT 0, "p_q" "text" DEFAULT ''::"text", "p_status" "text" DEFAULT 'all'::"text") RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare e personnel_private.employees; result jsonb;
begin
  perform personnel_private.assert_admin(p_workspace_id,p_actor_id);
  if p_id is not null then
    select * into e from personnel_private.employees where id=p_id and workspace_id=p_workspace_id;
    if not found then raise sqlstate 'PT404' using message='직원을 찾을 수 없습니다.'; end if;
    return jsonb_build_object('employee',to_jsonb(e)-'resident_number'||jsonb_build_object('has_resident_number',e.resident_number is not null),
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


ALTER FUNCTION "public"."personnel_query"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid", "p_page" integer, "p_q" "text", "p_status" "text") OWNER TO "postgres";

--
-- Name: personnel_reveal("uuid", "uuid", "uuid"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."personnel_reveal"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare ciphertext text;
begin
  perform personnel_private.assert_admin(p_workspace_id,p_actor_id);
  select resident_number into ciphertext from personnel_private.employees where id=p_id and workspace_id=p_workspace_id;
  if not found then raise sqlstate 'PT404' using message='직원을 찾을 수 없습니다.'; end if;
  insert into personnel_private.events(employee_id,actor_id,action,reason,effective_date) values(p_id,p_actor_id,'reveal','주민번호 조회',(now() at time zone 'Asia/Seoul')::date);
  return ciphertext;
end $$;


ALTER FUNCTION "public"."personnel_reveal"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid") OWNER TO "postgres";

--
-- Name: personnel_save("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."personnel_save"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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
    bank_name=coalesce(p->>'bank_name',bank_name),bank_account=coalesce(p->>'bank_account',bank_account),
    employment_start_date=start_day,contract_end_date=nullif(p->>'contract_end_date','')::date,annual_salary=(p->>'annual_salary')::bigint,
    resident_number=case when p?'resident_number' then nullif(p->>'resident_number','') else resident_number end,
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


ALTER FUNCTION "public"."personnel_save"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p" "jsonb") OWNER TO "postgres";

--
-- Name: reset_hr_leave_year("uuid", "uuid", integer, boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."reset_hr_leave_year"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_year" integer, "p_is_admin" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
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


ALTER FUNCTION "public"."reset_hr_leave_year"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_year" integer, "p_is_admin" boolean) OWNER TO "postgres";

--
-- Name: save_course_cost_changes("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  item jsonb;
  existing_row public.course_costs%rowtype;
  saved_row public.course_costs%rowtype;
  v_workspace_id uuid;
begin
  select c.workspace_id into v_workspace_id
  from public.courses c
  where c.id = p_course_id;

  if v_workspace_id is null or not exists (
    select 1 from public.workspace_members m
    where m.workspace_id = v_workspace_id and m.user_id = p_actor_id
  ) then
    raise exception '비용을 관리할 권한이 없습니다.';
  end if;

  if exists (
    select 1 from public.course_settlement_projects p
    where p.course_id = p_course_id and p.status = '정산확정'
  ) then
    raise exception '정산이 확정되어 비용을 변경할 수 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise exception '비용 변경 형식이 올바르지 않습니다.';
  end if;

  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'creates', '[]'::jsonb))
  loop
    insert into public.course_costs (
      course_id, category_code, name, burden_type, manager_user_id, manager_name,
      gross_amount, supply_amount, vat_amount, tax_type, paid_date, status,
      evidence_required, evidence_needs_review, evidence_types, other_evidence_type,
      company_share_rate, instructor_share_rate, company_share_amount, instructor_share_amount,
      include_in_settlement, note, created_by, updated_by
    ) values (
      p_course_id, item->>'category_code', item->>'name', item->>'burden_type',
      nullif(item->>'manager_user_id', '')::uuid, item->>'manager_name',
      (item->>'gross_amount')::bigint, (item->>'supply_amount')::bigint, (item->>'vat_amount')::bigint,
      'TAXABLE', nullif(item->>'paid_date', '')::date, item->>'status',
      false, false, '{}', '',
      (item->>'company_share_rate')::numeric, (item->>'instructor_share_rate')::numeric,
      (item->>'company_share_amount')::bigint, (item->>'instructor_share_amount')::bigint,
      true, '', p_actor_id, p_actor_id
    )
    returning * into saved_row;

    insert into public.course_cost_audit_logs (
      course_cost_id, course_id, actor_id, action, after_data
    ) values (saved_row.id, p_course_id, p_actor_id, 'CREATED', to_jsonb(saved_row));
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'updates', '[]'::jsonb))
  loop
    select * into existing_row
    from public.course_costs c
    where c.id = (item->>'id')::uuid
      and c.course_id = p_course_id
      and c.deleted_at is null
    for update;

    if not found then
      raise exception '수정할 비용을 찾을 수 없습니다.';
    end if;
    if existing_row.version <> (item->>'version')::integer then
      raise exception '다른 사용자가 비용을 수정했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    update public.course_costs c
    set category_code = item->>'category_code',
        name = item->>'name',
        burden_type = item->>'burden_type',
        manager_user_id = nullif(item->>'manager_user_id', '')::uuid,
        manager_name = item->>'manager_name',
        gross_amount = (item->>'gross_amount')::bigint,
        supply_amount = (item->>'supply_amount')::bigint,
        vat_amount = (item->>'vat_amount')::bigint,
        tax_type = 'TAXABLE',
        paid_date = nullif(item->>'paid_date', '')::date,
        status = item->>'status',
        evidence_required = false,
        evidence_needs_review = false,
        evidence_types = '{}',
        other_evidence_type = '',
        company_share_rate = (item->>'company_share_rate')::numeric,
        instructor_share_rate = (item->>'instructor_share_rate')::numeric,
        company_share_amount = (item->>'company_share_amount')::bigint,
        instructor_share_amount = (item->>'instructor_share_amount')::bigint,
        include_in_settlement = true,
        note = '',
        version = c.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    where c.id = existing_row.id
    returning * into saved_row;

    insert into public.course_cost_audit_logs (
      course_cost_id, course_id, actor_id, action, before_data, after_data
    ) values (
      saved_row.id, p_course_id, p_actor_id, 'UPDATED',
      to_jsonb(existing_row), to_jsonb(saved_row)
    );
  end loop;

  for item in
    select value from jsonb_array_elements(coalesce(p_changes->'deletes', '[]'::jsonb))
  loop
    select * into existing_row
    from public.course_costs c
    where c.id = (item->>'id')::uuid
      and c.course_id = p_course_id
      and c.deleted_at is null
    for update;

    if not found then
      raise exception '삭제할 비용을 찾을 수 없습니다.';
    end if;
    if existing_row.version <> (item->>'version')::integer then
      raise exception '다른 사용자가 비용을 수정했습니다. 새로고침 후 다시 시도해 주세요.';
    end if;

    update public.course_costs c
    set deleted_at = now(),
        version = c.version + 1,
        updated_by = p_actor_id,
        updated_at = now()
    where c.id = existing_row.id
    returning * into saved_row;

    insert into public.course_cost_audit_logs (
      course_cost_id, course_id, actor_id, action, before_data, after_data
    ) values (
      saved_row.id, p_course_id, p_actor_id, 'DELETED',
      to_jsonb(existing_row), to_jsonb(saved_row)
    );
  end loop;
end;
$$;


ALTER FUNCTION "public"."save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") OWNER TO "postgres";

--
-- Name: save_course_cost_changes_and_reset_settlement("uuid", "uuid", "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_course_cost_changes_and_reset_settlement"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  project public.course_settlement_projects%rowtype;
begin
  if not exists (
    select 1 from public.courses c
    join public.workspace_members m on m.workspace_id = c.workspace_id
    where c.id = p_course_id and m.user_id = p_actor_id
  ) then
    raise exception '비용을 관리할 권한이 없습니다.';
  end if;

  if jsonb_typeof(coalesce(p_changes, '{}'::jsonb)) <> 'object' then
    raise exception '비용 변경 형식이 올바르지 않습니다.';
  end if;
  if jsonb_array_length(coalesce(p_changes->'creates', '[]'::jsonb))
    + jsonb_array_length(coalesce(p_changes->'updates', '[]'::jsonb))
    + jsonb_array_length(coalesce(p_changes->'deletes', '[]'::jsonb)) = 0 then
    return;
  end if;

  select * into project from public.course_settlement_projects
  where course_id = p_course_id for update;

  if found then
    delete from public.settlement_cost_snapshots where settlement_id = project.id;
    delete from public.course_settlement_versions where settlement_id = project.id;
    update public.course_settlement_projects
    set analysis_snapshot = null,
        statement_draft = '{}'::jsonb,
        status = '비용입력중',
        latest_version = latest_version + 1,
        updated_at = now()
    where id = project.id;

    insert into public.audit_logs (workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
    values (project.workspace_id, p_actor_id, 'course_settlement.reset_by_cost_change',
      'course_settlement', project.id, jsonb_build_object('previous_version', project.latest_version));
  end if;

  -- Any validation or optimistic-lock failure also rolls back the reset above.
  perform public.save_course_cost_changes(p_course_id, p_actor_id, p_changes);
end;
$$;


ALTER FUNCTION "public"."save_course_cost_changes_and_reset_settlement"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") OWNER TO "postgres";

--
-- Name: save_course_paid_roster("uuid", "uuid", "uuid"[]); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_course_paid_roster"("p_course_id" "uuid", "p_actor_id" "uuid", "p_order_ids" "uuid"[]) RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_course public.courses%rowtype;
  v_job public.course_jobs%rowtype;
  v_version integer;
  v_count integer;
begin
  select * into v_course from public.courses where id = p_course_id for update;
  if v_course.id is null or not exists (
    select 1 from public.workspace_members where workspace_id = v_course.workspace_id and user_id = p_actor_id
  ) then
    raise exception '유료수강생 명단을 관리할 권한이 없습니다.';
  end if;
  if p_order_ids is null or cardinality(p_order_ids) > 10000 then
    raise exception '한 번에 최대 10,000건을 저장할 수 있습니다.';
  end if;
  select count(*) into v_count from public.course_orders
    where course_id = p_course_id and id = any(p_order_ids)
      and regexp_replace(normalize(status, NFKC), '\s', '', 'g') = '결제완료';
  if v_count <> cardinality(p_order_ids) then
    raise exception '주문이 변경되었습니다. 주문내역을 새로고침한 뒤 명단을 다시 만들어 주세요.';
  end if;

  select * into v_job from public.course_jobs
    where course_id = p_course_id and is_order_roster for update;
  if v_job.id is null then
    insert into public.course_jobs(workspace_id, course_id, name, default_course_name, status, latest_version, created_by, is_order_roster)
      values (v_course.workspace_id, p_course_id, v_course.name || ' 유료수강생', v_course.name, 'ready', 0, p_actor_id, true)
      returning * into v_job;
  end if;
  -- Initializing an existing roster must never clear or version its contents.
  if cardinality(p_order_ids) = 0 and v_job.latest_version > 0 then return v_job.id; end if;
  v_version := v_job.latest_version + 1;

  with chosen as (
    select o.*, regexp_replace(normalize(o.phone, NFKC), '[^0-9]', '', 'g') as digits
    from public.course_orders o where o.course_id = p_course_id and o.id = any(p_order_ids)
  ), phones as (
    select *, regexp_replace(digits, '^(0082|82)', '') as local_phone from chosen
  ), incoming as (
    select *, case when local_phone like '10%' then '0' || local_phone else local_phone end as normalized_phone
    from phones
  ), mapped as (
    select record_key, normalized_phone, jsonb_build_object(
      'courseName', v_course.name, 'optionName', option_name, 'customerName', member_name,
      'phone', normalized_phone, 'email', email, 'referrer', rs, 'source', rs, 'adMedia', ad_media,
      'rs', rs, 'paymentMethod', payment_method, 'paymentId', payment_id, 'paymentAmount', payment_amount::text,
      'orderRecordKey', record_key
    ) as vals,
    jsonb_build_object('이름', member_name, '연락처', phone, '이메일', email, '옵션명', option_name,
      'RS', rs, '결제방법', payment_method, '결제ID', payment_id, '결제금액', payment_amount::text) as original
    from incoming
  ), existing as (
    select * from public.job_enrollments where job_id = v_job.id and version = v_job.latest_version
  ), combined as (
    select e.source_row_number as position, e.student_id,
      coalesce(m.normalized_phone, e.normalized_phone) as phone,
      e.normalized_values || coalesce(m.vals, '{}'::jsonb) as vals,
      e.original_values || coalesce(m.original, '{}'::jsonb) as original,
      e.is_extra_participant, e.is_manually_added
    from existing e left join mapped m on m.record_key = e.normalized_values->>'orderRecordKey'
    union all
    select (select coalesce(max(source_row_number), 1) from existing) + row_number() over(order by m.record_key),
      null::uuid, m.normalized_phone, m.vals || '{"groupChatJoined":false,"memo":""}'::jsonb,
      m.original, false, false
    from mapped m where not exists (select 1 from existing e where e.normalized_values->>'orderRecordKey' = m.record_key)
  )
  insert into public.job_enrollments(job_id, version, student_id, normalized_phone, normalized_values, original_values,
    source_row_number, is_duplicate, is_extra_participant, is_manually_added)
  select v_job.id, v_version, student_id, phone, vals, original, row_number() over(order by position) + 1,
    coalesce(phone, '') <> '' and count(*) over(partition by phone) > 1, is_extra_participant, is_manually_added
  from combined;

  update public.course_jobs set latest_version = v_version,
    valid_count = (select count(*) from public.job_enrollments where job_id = v_job.id and version = v_version),
    default_course_name = v_course.name, status = 'ready', updated_at = now()
    where id = v_job.id;
  insert into public.audit_logs(workspace_id, actor_id, event_type, entity_type, entity_id, metadata)
    values(v_course.workspace_id, p_actor_id, 'course_job.orders_saved', 'course_job', v_job.id,
      jsonb_build_object('version', v_version, 'order_count', cardinality(p_order_ids)));
  return v_job.id;
end;
$$;


ALTER FUNCTION "public"."save_course_paid_roster"("p_course_id" "uuid", "p_actor_id" "uuid", "p_order_ids" "uuid"[]) OWNER TO "postgres";

--
-- Name: save_course_webinar_metrics("uuid", "jsonb", integer); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_course_webinar_metrics"("p_course_id" "uuid", "p_metrics" "jsonb", "p_expected_version" integer) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE entry record; amount numeric; result public.course_webinar_metrics;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT401',MESSAGE='로그인이 필요합니다.'; END IF;
  PERFORM 1 FROM public.courses WHERE id=p_course_id AND public.is_workspace_member(workspace_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PT404',MESSAGE='강의를 찾을 수 없거나 접근 권한이 없습니다.'; END IF;
  IF p_expected_version IS NULL OR p_expected_version<0 OR p_metrics IS NULL OR jsonb_typeof(p_metrics)<>'object' THEN
    RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='웨비나 입력 형식이 올바르지 않습니다.';
  END IF;
  FOR entry IN SELECT * FROM jsonb_each(p_metrics) LOOP
    IF entry.key NOT IN ('group_chat_count','communication_count','live_start_count','live_peak_count','hours_to_peak','live_end_count','ad_spend','payment_count','revenue') THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='알 수 없는 웨비나 항목입니다.';
    END IF;
    IF entry.value='null'::jsonb THEN CONTINUE; END IF;
    IF jsonb_typeof(entry.value)<>'number' THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='숫자를 입력해 주세요.'; END IF;
    amount:=(entry.value#>>'{}')::numeric;
    IF amount<0 OR amount>(CASE WHEN entry.key='hours_to_peak' THEN 1000 WHEN entry.key IN ('ad_spend','revenue') THEN 1000000000000 ELSE 1000000000 END)
      OR (entry.key<>'hours_to_peak' AND amount<>trunc(amount)) OR (entry.key='hours_to_peak' AND amount<>round(amount,2)) THEN
      RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='인원·결제 건수·금액은 0 이상의 정수, 시간은 소수 둘째 자리까지 입력해 주세요.';
    END IF;
  END LOOP;
  IF p_expected_version>0 AND NOT EXISTS(SELECT 1 FROM public.course_webinar_metrics WHERE course_id=p_course_id) THEN
    RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='저장 정보가 변경되었습니다. 새로 불러온 뒤 저장해 주세요.';
  END IF;
  INSERT INTO public.course_webinar_metrics(course_id,group_chat_count,communication_count,live_start_count,live_peak_count,hours_to_peak,live_end_count,ad_spend,payment_count,revenue)
  VALUES(p_course_id,(p_metrics->>'group_chat_count')::numeric::bigint,(p_metrics->>'communication_count')::numeric::bigint,
    (p_metrics->>'live_start_count')::numeric::bigint,(p_metrics->>'live_peak_count')::numeric::bigint,(p_metrics->>'hours_to_peak')::numeric,
    (p_metrics->>'live_end_count')::numeric::bigint,(p_metrics->>'ad_spend')::numeric::bigint,(p_metrics->>'payment_count')::numeric::bigint,(p_metrics->>'revenue')::numeric::bigint)
  ON CONFLICT(course_id) DO UPDATE SET
    group_chat_count=excluded.group_chat_count,communication_count=excluded.communication_count,
    live_start_count=excluded.live_start_count,live_peak_count=excluded.live_peak_count,hours_to_peak=excluded.hours_to_peak,
    live_end_count=excluded.live_end_count,ad_spend=excluded.ad_spend,payment_count=excluded.payment_count,revenue=excluded.revenue,
    version=course_webinar_metrics.version+1,updated_at=clock_timestamp()
  WHERE course_webinar_metrics.version=p_expected_version
  RETURNING * INTO result;
  IF result.course_id IS NULL THEN RAISE EXCEPTION USING ERRCODE='PT409',MESSAGE='다른 사용자가 수정했습니다. 새로 불러온 뒤 다시 저장해 주세요.'; END IF;
  RETURN to_jsonb(result);
EXCEPTION WHEN check_violation THEN RAISE EXCEPTION USING ERRCODE='PT400',MESSAGE='최대 인원과 입력 값의 범위를 확인해 주세요.';
END $$;


ALTER FUNCTION "public"."save_course_webinar_metrics"("p_course_id" "uuid", "p_metrics" "jsonb", "p_expected_version" integer) OWNER TO "postgres";

--
-- Name: save_youtube_analysis("uuid", "jsonb", "jsonb", "jsonb", timestamp with time zone, "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_youtube_analysis"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare run_id uuid;
begin
  perform 1 from public.youtube_analysis_batches where id=p_batch for update;
  if not found then raise exception 'Batch not found'; end if;
  select id into run_id from public.youtube_analysis_runs where batch_id=p_batch and channel_id=p_channel->>'id';
  if run_id is null then
    insert into public.youtube_analysis_runs(batch_id,channel_id,channel,metrics,warnings,started_at)
    values(p_batch,p_channel->>'id',p_channel,p_metrics,p_warnings,p_started) returning id into run_id;
    insert into public.youtube_video_snapshots(run_id,video_id,published_at,data)
    select run_id, v->>'id', (v->>'publishedAt')::timestamptz, v from jsonb_array_elements(p_videos) v;
  end if;
  update public.youtube_analysis_requests set status='completed',error_code=null where batch_id=p_batch and resolved_channel_id=p_channel->>'id';
  return run_id;
end;
$$;


ALTER FUNCTION "public"."save_youtube_analysis"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") OWNER TO "postgres";

--
-- Name: save_youtube_channel("uuid", "jsonb", "jsonb", "jsonb", timestamp with time zone, "jsonb"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."save_youtube_channel"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") RETURNS "text"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
declare
  v_workspace_id uuid;
  v_channel_id text := p_channel->>'id';
  v_saved_channel_id text;
begin
  select workspace_id into v_workspace_id
  from public.youtube_analysis_batches
  where id = p_batch
  for update;

  if not found then
    raise exception 'Batch not found';
  end if;
  if v_channel_id is null or v_channel_id = '' then
    raise exception 'Channel id is required';
  end if;

  insert into public.youtube_analyzed_channels(
    workspace_id,
    channel_id,
    channel,
    metrics,
    warnings,
    first_analyzed_at,
    last_analysis_started_at,
    last_analyzed_at
  )
  values(
    v_workspace_id,
    v_channel_id,
    p_channel,
    p_metrics,
    p_warnings,
    p_started,
    p_started,
    now()
  )
  on conflict(workspace_id, channel_id) do update set
    channel = excluded.channel,
    metrics = excluded.metrics,
    warnings = excluded.warnings,
    last_analysis_started_at = excluded.last_analysis_started_at,
    last_analyzed_at = excluded.last_analyzed_at
  where excluded.last_analysis_started_at >= youtube_analyzed_channels.last_analysis_started_at
  returning channel_id into v_saved_channel_id;

  if v_saved_channel_id is not null then
    delete from public.youtube_channel_videos
    where workspace_id = v_workspace_id and channel_id = v_channel_id;

    insert into public.youtube_channel_videos(workspace_id, channel_id, video_id, published_at, data)
    select v_workspace_id, v_channel_id, v->>'id', (v->>'publishedAt')::timestamptz, v
    from jsonb_array_elements(p_videos) v;
  end if;

  update public.youtube_analysis_requests
  set status = 'completed', error_code = null
  where batch_id = p_batch and resolved_channel_id = v_channel_id;

  return v_channel_id;
end;
$$;


ALTER FUNCTION "public"."save_youtube_channel"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") OWNER TO "postgres";

--
-- Name: set_user_account_role("uuid", "public"."app_role"); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_user_account_role"("target_user_id" "uuid", "target_role" "public"."app_role") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $$
declare
  shared_workspace_id uuid;
begin
  if target_role not in ('admin'::public.app_role, 'user'::public.app_role) then
    raise exception '지원하지 않는 사용자 권한입니다.';
  end if;

  if not exists (select 1 from auth.users u where u.id = target_user_id) then
    raise exception '변경할 사용자를 찾을 수 없습니다.';
  end if;

  if exists (
    select 1
    from auth.users u
    where u.id = target_user_id
      and lower(u.email) = 'resumet@gmail.com'
  ) then
    raise exception '최고관리자 권한은 변경할 수 없습니다.';
  end if;

  select w.id
    into shared_workspace_id
  from public.workspaces w
  where w.is_primary
  limit 1;

  if shared_workspace_id is null then
    raise exception '기본 워크스페이스를 찾을 수 없습니다.';
  end if;

  update public.workspace_members
  set role = target_role
  where user_id = target_user_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (shared_workspace_id, target_user_id, target_role)
  on conflict (workspace_id, user_id)
  do update set role = excluded.role;

  return shared_workspace_id;
end;
$$;


ALTER FUNCTION "public"."set_user_account_role"("target_user_id" "uuid", "target_role" "public"."app_role") OWNER TO "postgres";

--
-- Name: set_work_task_status_with_event("uuid", "uuid", "uuid", "text", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."set_work_task_status_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_status" "text", "p_is_admin" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  current_task public.work_tasks;
  changed_task public.work_tasks;
begin
  if p_status not in ('open', 'done') then
    raise exception 'INVALID_STATUS';
  end if;

  select * into current_task
  from public.work_tasks
  where id = p_task_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if not p_is_admin and current_task.assignee_id <> p_actor_id then
    raise exception 'TASK_ACCESS_DENIED';
  end if;

  if current_task.status = p_status then return to_jsonb(current_task); end if;

  update public.work_tasks
  set status = p_status,
      completed_at = case when p_status = 'done' then now() else null end,
      updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (task_id, actor_id, event_type)
  values (
    p_task_id,
    p_actor_id,
    case when p_status = 'done' then 'completed' else 'reopened' end
  );

  return to_jsonb(changed_task);
end;
$$;


ALTER FUNCTION "public"."set_work_task_status_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_status" "text", "p_is_admin" boolean) OWNER TO "postgres";

--
-- Name: touch_course_schedule_draft_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."touch_course_schedule_draft_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_course_schedule_draft_updated_at"() OWNER TO "postgres";

--
-- Name: touch_course_wbs_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."touch_course_wbs_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_course_wbs_updated_at"() OWNER TO "postgres";

--
-- Name: touch_hr_leave_updated_at(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."touch_hr_leave_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."touch_hr_leave_updated_at"() OWNER TO "postgres";

--
-- Name: transfer_work_task_with_event("uuid", "uuid", "uuid", "uuid", "text", boolean); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."transfer_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_assignee_id" "uuid", "p_note" "text" DEFAULT ''::"text", "p_is_admin" boolean DEFAULT false) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  current_task public.work_tasks;
  changed_task public.work_tasks;
begin
  select * into current_task
  from public.work_tasks
  where id = p_task_id and workspace_id = p_workspace_id
  for update;

  if not found then raise exception 'TASK_NOT_FOUND'; end if;
  if not p_is_admin and current_task.assignee_id <> p_actor_id then
    raise exception 'TASK_ACCESS_DENIED';
  end if;
  if current_task.assignee_id = p_assignee_id then
    raise exception 'ASSIGNEE_UNCHANGED';
  end if;
  if not exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = p_assignee_id
  ) then
    raise exception 'ASSIGNEE_NOT_IN_WORKSPACE';
  end if;

  update public.work_tasks
  set assignee_id = p_assignee_id, updated_at = now()
  where id = p_task_id
  returning * into changed_task;

  insert into public.work_task_events (
    task_id, actor_id, event_type, from_assignee_id, to_assignee_id, metadata
  ) values (
    p_task_id,
    p_actor_id,
    'transferred',
    current_task.assignee_id,
    p_assignee_id,
    jsonb_build_object('note', coalesce(p_note, ''))
  );

  return to_jsonb(changed_task);
end;
$$;


ALTER FUNCTION "public"."transfer_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_is_admin" boolean) OWNER TO "postgres";

--
-- Name: youtube_snapshot_immutable(); Type: FUNCTION; Schema: public; Owner: postgres
--

CREATE FUNCTION "public"."youtube_snapshot_immutable"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  raise exception 'YouTube analysis snapshots are immutable';
end;
$$;


ALTER FUNCTION "public"."youtube_snapshot_immutable"() OWNER TO "postgres";

--
-- Name: audit; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."audit" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "entity_type" "text" NOT NULL,
    "entity_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "hr"."audit" OWNER TO "postgres";

--
-- Name: COLUMN "audit"."actor_id"; Type: COMMENT; Schema: hr; Owner: postgres
--

COMMENT ON COLUMN "hr"."audit"."actor_id" IS 'HR employee responsible for a user action; NULL for an authenticated account lifecycle trigger (see action/reason).';


--
-- Name: commands; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."commands" (
    "employee_id" "uuid" NOT NULL,
    "request_key" "uuid" NOT NULL,
    "command" "text" NOT NULL,
    "body" "jsonb" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "hr"."commands" OWNER TO "postgres";

--
-- Name: comments; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."comments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "author_id" "uuid" NOT NULL,
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "comments_body_check" CHECK ((("length"("btrim"("body")) >= 1) AND ("length"("btrim"("body")) <= 10000)))
);


ALTER TABLE "hr"."comments" OWNER TO "postgres";

--
-- Name: corrections; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."corrections" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "record_id" "uuid",
    "record_version" integer,
    "requested_in" timestamp with time zone NOT NULL,
    "requested_out" timestamp with time zone,
    "reason" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "review_reason" "text",
    "reviewed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "corrections_check" CHECK ((("requested_out" IS NULL) OR ("requested_out" >= "requested_in"))),
    CONSTRAINT "corrections_reason_check" CHECK ((("length"("btrim"("reason")) >= 1) AND ("length"("btrim"("reason")) <= 2000))),
    CONSTRAINT "corrections_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'applied'::"text", 'rejected'::"text"])))
);


ALTER TABLE "hr"."corrections" OWNER TO "postgres";

--
-- Name: invitations; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."invitations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "department" "text" NOT NULL,
    "role" "text" NOT NULL,
    "employment_start_date" "date" NOT NULL,
    "invited_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "auth_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "auth_deleted_at" timestamp with time zone,
    CONSTRAINT "invitations_role_check" CHECK (("role" = ANY (ARRAY['employee'::"text", 'admin'::"text"]))),
    CONSTRAINT "invitations_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'sending'::"text", 'sent'::"text", 'failed'::"text"])))
);


ALTER TABLE "hr"."invitations" OWNER TO "postgres";

--
-- Name: leave_days; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."leave_days" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "leave_id" "uuid" NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "day" "date" NOT NULL,
    "segment" "text" NOT NULL,
    "start_min" integer NOT NULL,
    "end_min" integer NOT NULL,
    "policy_id" "uuid" NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "leave_version" integer NOT NULL,
    CONSTRAINT "leave_days_segment_check" CHECK (("segment" = ANY (ARRAY['am'::"text", 'pm'::"text"])))
);


ALTER TABLE "hr"."leave_days" OWNER TO "postgres";

--
-- Name: notifications; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "event_id" "uuid" NOT NULL,
    "recipient_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "entity_id" "uuid",
    "payload" "jsonb" NOT NULL,
    "read_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "hr"."notifications" OWNER TO "postgres";

--
-- Name: organizations; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."organizations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" DEFAULT 'HR & Work Dashboard'::"text" NOT NULL,
    "timezone" "text" DEFAULT 'Asia/Seoul'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "organizations_timezone_check" CHECK (("timezone" = 'Asia/Seoul'::"text"))
);


ALTER TABLE "hr"."organizations" OWNER TO "postgres";

--
-- Name: outbox; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."outbox" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "event_key" "text" NOT NULL,
    "event_type" "text" NOT NULL,
    "entity_id" "uuid",
    "actor_id" "uuid",
    "payload" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "recipients" "uuid"[] DEFAULT '{}'::"uuid"[] NOT NULL,
    "include_actor" boolean DEFAULT false NOT NULL,
    "processed_at" timestamp with time zone,
    "attempts" integer DEFAULT 0 NOT NULL,
    "next_retry_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_error" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "hr"."outbox" OWNER TO "postgres";

--
-- Name: personnel; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."personnel" (
    "employee_id" "uuid" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "resident_number_ciphertext" "text",
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "contract_end_date" "date",
    "annual_salary" bigint,
    "status" "text" DEFAULT 'employed'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personnel_address_check" CHECK (("length"("address") <= 500)),
    CONSTRAINT "personnel_annual_salary_check" CHECK ((("annual_salary" >= 0) AND ("annual_salary" <= '999999999999'::bigint))),
    CONSTRAINT "personnel_memo_check" CHECK (("length"("memo") <= 10000)),
    CONSTRAINT "personnel_phone_check" CHECK (("length"("phone") <= 40)),
    CONSTRAINT "personnel_status_check" CHECK (("status" = ANY (ARRAY['employed'::"text", 'resigned'::"text", 'dismissed'::"text", 'inactive'::"text"])))
);


ALTER TABLE "hr"."personnel" OWNER TO "postgres";

--
-- Name: personnel_events; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."personnel_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "effective_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "personnel_events_action_check" CHECK (("action" = ANY (ARRAY['hire'::"text", 'update'::"text", 'rehire'::"text", 'resign'::"text", 'dismiss'::"text"]))),
    CONSTRAINT "personnel_events_reason_check" CHECK ((("length"("btrim"("reason")) >= 1) AND ("length"("btrim"("reason")) <= 2000)))
);


ALTER TABLE "hr"."personnel_events" OWNER TO "postgres";

--
-- Name: review_revisions; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."review_revisions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "review_id" "uuid" NOT NULL,
    "revision" integer NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "items" "jsonb" NOT NULL,
    "late" boolean NOT NULL,
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "review_revisions_note_check" CHECK (("length"("note") <= 3000))
);


ALTER TABLE "hr"."review_revisions" OWNER TO "postgres";

--
-- Name: reviews; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "organization_id" "uuid" NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "latest_revision" integer DEFAULT 0 NOT NULL,
    "submitted_at" timestamp with time zone
);


ALTER TABLE "hr"."reviews" OWNER TO "postgres";

--
-- Name: task_events; Type: TABLE; Schema: hr; Owner: postgres
--

CREATE TABLE "hr"."task_events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "task_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "task_version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "hr"."task_events" OWNER TO "postgres";

--
-- Name: tasks_task_number_seq; Type: SEQUENCE; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."tasks" ALTER COLUMN "task_number" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "hr"."tasks_task_number_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: employees; Type: TABLE; Schema: personnel_private; Owner: postgres
--

CREATE TABLE "personnel_private"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid",
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "address" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "resident_number" "text",
    "employment_start_date" "date" NOT NULL,
    "contract_end_date" "date",
    "annual_salary" bigint,
    "status" "text" DEFAULT 'employed'::"text" NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "bank_name" "text" DEFAULT ''::"text" NOT NULL,
    "bank_account" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "employees_address_check" CHECK (("length"("address") <= 500)),
    CONSTRAINT "employees_annual_salary_check" CHECK ((("annual_salary" >= 0) AND ("annual_salary" <= '999999999999'::bigint))),
    CONSTRAINT "employees_bank_account_check" CHECK ((("length"("bank_account") <= 50) AND ("bank_account" ~ '^[0-9 -]*$'::"text"))),
    CONSTRAINT "employees_bank_name_check" CHECK (("length"("bank_name") <= 100)),
    CONSTRAINT "employees_check" CHECK ((("contract_end_date" IS NULL) OR ("contract_end_date" >= "employment_start_date"))),
    CONSTRAINT "employees_email_check" CHECK ((("length"("email") >= 3) AND ("length"("email") <= 254))),
    CONSTRAINT "employees_memo_check" CHECK (("length"("memo") <= 10000)),
    CONSTRAINT "employees_name_check" CHECK ((("length"("btrim"("name")) >= 1) AND ("length"("btrim"("name")) <= 100))),
    CONSTRAINT "employees_phone_check" CHECK (("length"("phone") <= 40)),
    CONSTRAINT "employees_status_check" CHECK (("status" = ANY (ARRAY['employed'::"text", 'resigned'::"text", 'dismissed'::"text"]))),
    CONSTRAINT "personnel_resident_number_format" CHECK ((("resident_number" IS NULL) OR ("resident_number" ~ '^[0-9]{6}[1-8][0-9]{6}$'::"text")))
);


ALTER TABLE "personnel_private"."employees" OWNER TO "postgres";

--
-- Name: events; Type: TABLE; Schema: personnel_private; Owner: postgres
--

CREATE TABLE "personnel_private"."events" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "reason" "text" NOT NULL,
    "effective_date" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "events_reason_check" CHECK ((("length"("btrim"("reason")) >= 1) AND ("length"("btrim"("reason")) <= 2000)))
);


ALTER TABLE "personnel_private"."events" OWNER TO "postgres";

--
-- Name: periods; Type: TABLE; Schema: personnel_private; Owner: postgres
--

CREATE TABLE "personnel_private"."periods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "end_reason" "text",
    CONSTRAINT "periods_check" CHECK ((("end_date" IS NULL) OR ("end_date" >= "start_date")))
);


ALTER TABLE "personnel_private"."periods" OWNER TO "postgres";

--
-- Name: ad_performance_daily_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ad_performance_daily_metrics" (
    "workspace_id" "uuid" NOT NULL,
    "metric_date" "date" NOT NULL,
    "google_impressions" bigint DEFAULT 0 NOT NULL,
    "meta_impressions" bigint DEFAULT 0 NOT NULL,
    "google_clicks" bigint DEFAULT 0 NOT NULL,
    "meta_clicks" bigint DEFAULT 0 NOT NULL,
    "google_ad_leads" bigint DEFAULT 0 NOT NULL,
    "meta_ad_leads" bigint DEFAULT 0 NOT NULL,
    "google_spend" bigint DEFAULT 0 NOT NULL,
    "meta_spend" bigint DEFAULT 0 NOT NULL,
    "landing_leads" bigint DEFAULT 0 NOT NULL,
    "google_admin_leads" bigint DEFAULT 0 NOT NULL,
    "meta_admin_leads" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_performance_daily_metrics_google_ad_leads_check" CHECK (("google_ad_leads" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_google_admin_leads_check" CHECK (("google_admin_leads" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_google_clicks_check" CHECK (("google_clicks" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_google_impressions_check" CHECK (("google_impressions" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_google_spend_check" CHECK (("google_spend" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_landing_leads_check" CHECK (("landing_leads" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_meta_ad_leads_check" CHECK (("meta_ad_leads" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_meta_admin_leads_check" CHECK (("meta_admin_leads" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_meta_clicks_check" CHECK (("meta_clicks" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_meta_impressions_check" CHECK (("meta_impressions" >= 0)),
    CONSTRAINT "ad_performance_daily_metrics_meta_spend_check" CHECK (("meta_spend" >= 0))
);


ALTER TABLE "public"."ad_performance_daily_metrics" OWNER TO "postgres";

--
-- Name: TABLE "ad_performance_daily_metrics"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ad_performance_daily_metrics" IS 'Legacy workspace-wide metrics retained for safe rollback after course dashboards were introduced.';


--
-- Name: ad_performance_dashboard_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ad_performance_dashboard_metrics" (
    "dashboard_id" "uuid" NOT NULL,
    "metric_date" "date" NOT NULL,
    "google_impressions" bigint DEFAULT 0 NOT NULL,
    "meta_impressions" bigint DEFAULT 0 NOT NULL,
    "google_clicks" bigint DEFAULT 0 NOT NULL,
    "meta_clicks" bigint DEFAULT 0 NOT NULL,
    "google_ad_leads" bigint DEFAULT 0 NOT NULL,
    "meta_ad_leads" bigint DEFAULT 0 NOT NULL,
    "google_spend" bigint DEFAULT 0 NOT NULL,
    "meta_spend" bigint DEFAULT 0 NOT NULL,
    "google_landing_leads" bigint DEFAULT 0 NOT NULL,
    "meta_landing_leads" bigint DEFAULT 0 NOT NULL,
    "admin_cumulative_leads" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "chat_room_members" bigint,
    CONSTRAINT "ad_performance_dashboard_metrics_admin_cumulative_leads_check" CHECK (("admin_cumulative_leads" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_chat_room_members_check" CHECK ((("chat_room_members" >= 0) AND ("chat_room_members" <= '9007199254740991'::bigint))),
    CONSTRAINT "ad_performance_dashboard_metrics_google_ad_leads_check" CHECK (("google_ad_leads" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_google_clicks_check" CHECK (("google_clicks" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_google_impressions_check" CHECK (("google_impressions" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_google_landing_leads_check" CHECK (("google_landing_leads" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_google_spend_check" CHECK (("google_spend" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_meta_ad_leads_check" CHECK (("meta_ad_leads" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_meta_clicks_check" CHECK (("meta_clicks" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_meta_impressions_check" CHECK (("meta_impressions" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_meta_landing_leads_check" CHECK (("meta_landing_leads" >= 0)),
    CONSTRAINT "ad_performance_dashboard_metrics_meta_spend_check" CHECK (("meta_spend" >= 0))
);


ALTER TABLE "public"."ad_performance_dashboard_metrics" OWNER TO "postgres";

--
-- Name: ad_performance_dashboards; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ad_performance_dashboards" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "total_budget" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_performance_dashboards_total_budget_check" CHECK (("total_budget" >= 0))
);


ALTER TABLE "public"."ad_performance_dashboards" OWNER TO "postgres";

--
-- Name: ad_performance_organic_metric_values; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ad_performance_organic_metric_values" (
    "dashboard_id" "uuid" NOT NULL,
    "channel_id" "uuid" NOT NULL,
    "metric_date" "date" NOT NULL,
    "lead_count" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_performance_organic_metric_values_lead_count_check" CHECK (("lead_count" >= 0))
);


ALTER TABLE "public"."ad_performance_organic_metric_values" OWNER TO "postgres";

--
-- Name: ad_performance_dashboard_summaries; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."ad_performance_dashboard_summaries" WITH ("security_invoker"='true') AS
 SELECT "id",
    "workspace_id",
    "course_id",
    "start_date",
    "total_budget",
    "updated_at",
    ( SELECT "count"(*) AS "count"
           FROM "public"."ad_performance_dashboard_metrics" "metric"
          WHERE ("metric"."dashboard_id" = "dashboard"."id")) AS "metric_count",
    (COALESCE(( SELECT "sum"(("metric"."google_spend" + "metric"."meta_spend")) AS "sum"
           FROM "public"."ad_performance_dashboard_metrics" "metric"
          WHERE ("metric"."dashboard_id" = "dashboard"."id")), (0)::numeric))::bigint AS "spend",
    (COALESCE(( SELECT "sum"(("metric"."google_ad_leads" + "metric"."meta_ad_leads")) AS "sum"
           FROM "public"."ad_performance_dashboard_metrics" "metric"
          WHERE ("metric"."dashboard_id" = "dashboard"."id")), (0)::numeric))::bigint AS "ad_leads",
    (COALESCE(( SELECT "sum"(("metric"."google_landing_leads" + "metric"."meta_landing_leads")) AS "sum"
           FROM "public"."ad_performance_dashboard_metrics" "metric"
          WHERE ("metric"."dashboard_id" = "dashboard"."id")), (0)::numeric))::bigint AS "paid_landing_leads",
    (COALESCE(( SELECT "sum"("value"."lead_count") AS "sum"
           FROM "public"."ad_performance_organic_metric_values" "value"
          WHERE ("value"."dashboard_id" = "dashboard"."id")), (0)::numeric))::bigint AS "organic_landing_leads",
    COALESCE(( SELECT "metric"."admin_cumulative_leads"
           FROM "public"."ad_performance_dashboard_metrics" "metric"
          WHERE ("metric"."dashboard_id" = "dashboard"."id")
          ORDER BY "metric"."metric_date" DESC
         LIMIT 1), (0)::bigint) AS "admin_cumulative_leads"
   FROM "public"."ad_performance_dashboards" "dashboard";


ALTER VIEW "public"."ad_performance_dashboard_summaries" OWNER TO "postgres";

--
-- Name: ad_performance_organic_channels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ad_performance_organic_channels" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "dashboard_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_performance_organic_channels_name_check" CHECK ((("char_length"("btrim"("name")) >= 1) AND ("char_length"("btrim"("name")) <= 80))),
    CONSTRAINT "ad_performance_organic_channels_sort_order_check" CHECK (("sort_order" >= 0))
);


ALTER TABLE "public"."ad_performance_organic_channels" OWNER TO "postgres";

--
-- Name: ad_performance_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."ad_performance_settings" (
    "workspace_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "total_budget" bigint DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "ad_performance_settings_total_budget_check" CHECK (("total_budget" >= 0))
);


ALTER TABLE "public"."ad_performance_settings" OWNER TO "postgres";

--
-- Name: TABLE "ad_performance_settings"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."ad_performance_settings" IS 'Legacy workspace-wide settings retained for safe rollback after course dashboards were introduced.';


--
-- Name: address_book_contacts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."address_book_contacts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "address_book_id" "uuid" NOT NULL,
    "normalized_phone" "text" NOT NULL,
    "name" "text",
    "email" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."address_book_contacts" OWNER TO "postgres";

--
-- Name: address_book_imports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."address_book_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "address_book_id" "uuid" NOT NULL,
    "original_filename" "text" NOT NULL,
    "total_rows" integer NOT NULL,
    "imported_rows" integer NOT NULL,
    "skipped_rows" integer NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."address_book_imports" OWNER TO "postgres";

--
-- Name: address_book_message_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."address_book_message_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "address_book_id" "uuid",
    "template_id" "text" NOT NULL,
    "template_code" "text" NOT NULL,
    "course_name" "text" NOT NULL,
    "target_scope" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_count" integer DEFAULT 0 NOT NULL,
    "success_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "provider" "text" DEFAULT 'shoong'::"text" NOT NULL,
    "delivery_checked_at" timestamp with time zone,
    "course_job_id" "uuid",
    "course_job_version" integer,
    CONSTRAINT "address_book_message_jobs_target_scope_check" CHECK (("target_scope" = ANY (ARRAY['all'::"text", 'filtered'::"text", 'selected'::"text", 'test'::"text"]))),
    CONSTRAINT "address_message_source_check" CHECK (((("address_book_id" IS NOT NULL) AND ("course_job_id" IS NULL) AND ("course_job_version" IS NULL)) OR (("address_book_id" IS NULL) AND ("course_job_id" IS NOT NULL) AND ("course_job_version" IS NOT NULL))))
);


ALTER TABLE "public"."address_book_message_jobs" OWNER TO "postgres";

--
-- Name: address_book_message_recipients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."address_book_message_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_job_id" "uuid" NOT NULL,
    "contact_id" "uuid",
    "recipient_name" "text",
    "normalized_phone" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "http_status" integer,
    "shoong_code" "text",
    "group_id" "text",
    "message_id" "text",
    "failure_reason" "text",
    "requested_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "provider" "text" DEFAULT 'shoong'::"text" NOT NULL,
    "provider_correlation_id" "text",
    "provider_status" "text",
    "provider_result_code" "text",
    "provider_result_message" "text",
    "final_message_type" "text",
    "delivery_checked_at" timestamp with time zone,
    "provider_batch_id" "uuid",
    "provider_seq" integer
);


ALTER TABLE "public"."address_book_message_recipients" OWNER TO "postgres";

--
-- Name: address_books; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."address_books" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "contact_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."address_books" OWNER TO "postgres";

--
-- Name: audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."audit_logs" (
    "id" bigint NOT NULL,
    "workspace_id" "uuid",
    "actor_id" "uuid",
    "event_type" "text" NOT NULL,
    "entity_type" "text" NOT NULL,
    "entity_id" "text",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."audit_logs" OWNER TO "postgres";

--
-- Name: audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: cash_flow_course_plans; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."cash_flow_course_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "expected_month" "date" NOT NULL,
    "nova_inflow" bigint DEFAULT 0 NOT NULL,
    "instructor_payout" bigint DEFAULT 0 NOT NULL,
    "is_included" boolean DEFAULT true NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_flow_course_plans_expected_month_check" CHECK ((("date_trunc"('month'::"text", ("expected_month")::timestamp with time zone))::"date" = "expected_month")),
    CONSTRAINT "cash_flow_course_plans_instructor_payout_check" CHECK (("instructor_payout" >= 0)),
    CONSTRAINT "cash_flow_course_plans_nova_inflow_check" CHECK (("nova_inflow" >= 0))
);


ALTER TABLE "public"."cash_flow_course_plans" OWNER TO "postgres";

--
-- Name: cash_flow_settings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."cash_flow_settings" (
    "workspace_id" "uuid" NOT NULL,
    "current_bank_balance" bigint DEFAULT 0 NOT NULL,
    "monthly_fixed_expense" bigint DEFAULT 0 NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "cash_flow_settings_monthly_fixed_expense_check" CHECK (("monthly_fixed_expense" >= 0))
);


ALTER TABLE "public"."cash_flow_settings" OWNER TO "postgres";

--
-- Name: course_cost_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_cost_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_cost_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_name" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_cost_attachments_file_size_check" CHECK ((("file_size" >= 1) AND ("file_size" <= 20971520)))
);


ALTER TABLE "public"."course_cost_attachments" OWNER TO "postgres";

--
-- Name: course_cost_audit_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_cost_audit_logs" (
    "id" bigint NOT NULL,
    "course_cost_id" "uuid",
    "course_id" "uuid" NOT NULL,
    "actor_id" "uuid",
    "action" "text" NOT NULL,
    "before_data" "jsonb",
    "after_data" "jsonb",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_cost_audit_logs_action_check" CHECK (("action" = ANY (ARRAY['CREATED'::"text", 'UPDATED'::"text", 'DELETED'::"text", 'RESTORED'::"text", 'SETTLEMENT_CHANGED'::"text", 'ATTACHMENT_ADDED'::"text", 'ATTACHMENT_DELETED'::"text", 'MIGRATED'::"text"])))
);


ALTER TABLE "public"."course_cost_audit_logs" OWNER TO "postgres";

--
-- Name: course_cost_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_cost_audit_logs" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."course_cost_audit_logs_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: course_costs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_costs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "category_code" "text" DEFAULT 'CUSTOM'::"text" NOT NULL,
    "name" "text" NOT NULL,
    "burden_type" "text" NOT NULL,
    "manager_user_id" "uuid",
    "manager_name" "text" NOT NULL,
    "gross_amount" bigint NOT NULL,
    "supply_amount" bigint NOT NULL,
    "vat_amount" bigint NOT NULL,
    "tax_type" "text" NOT NULL,
    "paid_date" "date",
    "status" "text" DEFAULT 'PLANNED'::"text" NOT NULL,
    "evidence_required" boolean DEFAULT true NOT NULL,
    "evidence_needs_review" boolean DEFAULT false NOT NULL,
    "evidence_types" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "other_evidence_type" "text" DEFAULT ''::"text" NOT NULL,
    "company_share_rate" numeric(5,2) DEFAULT 100 NOT NULL,
    "instructor_share_rate" numeric(5,2) DEFAULT 0 NOT NULL,
    "company_share_amount" bigint DEFAULT 0 NOT NULL,
    "instructor_share_amount" bigint DEFAULT 0 NOT NULL,
    "include_in_settlement" boolean DEFAULT true NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "migrated_from" "text",
    "version" integer DEFAULT 1 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    CONSTRAINT "course_costs_burden_type_check" CHECK (("burden_type" = ANY (ARRAY['COMPANY'::"text", 'INSTRUCTOR'::"text", 'SHARED'::"text", 'UNCLASSIFIED'::"text"]))),
    CONSTRAINT "course_costs_check" CHECK ((("vat_amount" >= 0) AND ("gross_amount" = ("supply_amount" + "vat_amount")))),
    CONSTRAINT "course_costs_check1" CHECK (((("instructor_share_rate" >= (0)::numeric) AND ("instructor_share_rate" <= (100)::numeric)) AND (("company_share_rate" + "instructor_share_rate") = ANY (ARRAY[(0)::numeric, (100)::numeric])))),
    CONSTRAINT "course_costs_check2" CHECK ((("instructor_share_amount" >= 0) AND ((("company_share_amount" + "instructor_share_amount") = 0) OR (("company_share_amount" + "instructor_share_amount") = "gross_amount")))),
    CONSTRAINT "course_costs_check3" CHECK ((("status" <> 'PAID'::"text") OR ("paid_date" IS NOT NULL))),
    CONSTRAINT "course_costs_check4" CHECK ((('기타'::"text" <> ALL ("evidence_types")) OR ("length"("other_evidence_type") > 0))),
    CONSTRAINT "course_costs_company_share_amount_check" CHECK (("company_share_amount" >= 0)),
    CONSTRAINT "course_costs_company_share_rate_check" CHECK ((("company_share_rate" >= (0)::numeric) AND ("company_share_rate" <= (100)::numeric))),
    CONSTRAINT "course_costs_gross_amount_check" CHECK (("gross_amount" >= 0)),
    CONSTRAINT "course_costs_manager_name_check" CHECK ((("length"("manager_name") >= 1) AND ("length"("manager_name") <= 100))),
    CONSTRAINT "course_costs_name_check" CHECK ((("length"("name") >= 1) AND ("length"("name") <= 100))),
    CONSTRAINT "course_costs_note_check" CHECK (("length"("note") <= 1000)),
    CONSTRAINT "course_costs_status_check" CHECK (("status" = ANY (ARRAY['PLANNED'::"text", 'PAID'::"text", 'CANCELED'::"text"]))),
    CONSTRAINT "course_costs_supply_amount_check" CHECK (("supply_amount" >= 0)),
    CONSTRAINT "course_costs_tax_type_check" CHECK (("tax_type" = ANY (ARRAY['TAXABLE'::"text", 'TAX_FREE'::"text", 'ZERO_RATED'::"text", 'REVIEW_REQUIRED'::"text"]))),
    CONSTRAINT "course_costs_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."course_costs" OWNER TO "postgres";

--
-- Name: course_instagram_materials; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_instagram_materials" (
    "course_id" "uuid" NOT NULL,
    "position" smallint NOT NULL,
    "title" "text" DEFAULT ''::"text" NOT NULL,
    "notion_url" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_instagram_materials_notion_url_check" CHECK (("char_length"("notion_url") <= 2048)),
    CONSTRAINT "course_instagram_materials_position_check" CHECK ((("position" >= 1) AND ("position" <= 40))),
    CONSTRAINT "course_instagram_materials_title_check" CHECK (("char_length"("title") <= 200))
);


ALTER TABLE "public"."course_instagram_materials" OWNER TO "postgres";

--
-- Name: course_instagram_shares; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_instagram_shares" (
    "course_id" "uuid" NOT NULL,
    "public_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "is_public" boolean DEFAULT false NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."course_instagram_shares" OWNER TO "postgres";

--
-- Name: course_job_invites; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_job_invites" (
    "job_id" "uuid" NOT NULL,
    "option_name" "text" NOT NULL,
    "entry_code" "text" DEFAULT ''::"text" NOT NULL,
    "link_name" "text" DEFAULT ''::"text" NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_job_invites_entry_code_check" CHECK (("char_length"("entry_code") <= 100)),
    CONSTRAINT "course_job_invites_link_name_check" CHECK (("char_length"("link_name") <= 2048)),
    CONSTRAINT "course_job_invites_option_name_check" CHECK ((("char_length"("option_name") >= 1) AND ("char_length"("option_name") <= 500)))
);


ALTER TABLE "public"."course_job_invites" OWNER TO "postgres";

--
-- Name: course_job_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_job_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_job_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "author_email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_job_notes_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 2000)))
);


ALTER TABLE "public"."course_job_notes" OWNER TO "postgres";

--
-- Name: course_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "default_course_name" "text",
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "latest_version" integer DEFAULT 0 NOT NULL,
    "valid_count" integer DEFAULT 0 NOT NULL,
    "error_count" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "course_id" "uuid",
    "is_order_roster" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."course_jobs" OWNER TO "postgres";

--
-- Name: course_live_videos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_live_videos" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "video_url" "text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."course_live_videos" OWNER TO "postgres";

--
-- Name: course_notes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_notes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "content" "text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "author_email" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_notes_content_check" CHECK ((("char_length"("content") >= 1) AND ("char_length"("content") <= 5000)))
);


ALTER TABLE "public"."course_notes" OWNER TO "postgres";

--
-- Name: course_options; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_options" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "list_price" bigint NOT NULL,
    "sale_price" bigint NOT NULL,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "group_chat_link" "text" DEFAULT ''::"text" NOT NULL,
    "entry_code" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "course_options_check" CHECK ((("sale_price" >= 0) AND ("sale_price" <= "list_price"))),
    CONSTRAINT "course_options_list_price_check" CHECK (("list_price" >= 0))
);


ALTER TABLE "public"."course_options" OWNER TO "postgres";

--
-- Name: COLUMN "course_options"."group_chat_link"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."course_options"."group_chat_link" IS 'Option-specific paid course group chat URL';


--
-- Name: COLUMN "course_options"."entry_code"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."course_options"."entry_code" IS 'Option-specific paid course group chat entry code';


--
-- Name: course_order_imports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_order_imports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "row_count" integer NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_order_imports_row_count_check" CHECK (("row_count" > 0))
);


ALTER TABLE "public"."course_order_imports" OWNER TO "postgres";

--
-- Name: course_orders; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_orders" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "record_key" "text" NOT NULL,
    "product_name" "text" NOT NULL,
    "option_name" "text" DEFAULT ''::"text" NOT NULL,
    "member_name" "text" DEFAULT ''::"text" NOT NULL,
    "phone" "text" DEFAULT ''::"text" NOT NULL,
    "email" "text" DEFAULT ''::"text" NOT NULL,
    "payment_amount" numeric(15,2) NOT NULL,
    "refund_amount" numeric(15,2) NOT NULL,
    "current_amount" numeric(15,2) NOT NULL,
    "status" "text" DEFAULT ''::"text" NOT NULL,
    "payment_method" "text" DEFAULT ''::"text" NOT NULL,
    "rs" "text" DEFAULT ''::"text" NOT NULL,
    "ad_media" "text" DEFAULT ''::"text" NOT NULL,
    "inflow_type" "text" DEFAULT ''::"text" NOT NULL,
    "payment_id" "text" DEFAULT ''::"text" NOT NULL,
    "order_id" "text" DEFAULT ''::"text" NOT NULL,
    "refund_date" "date",
    "import_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."course_orders" OWNER TO "postgres";

--
-- Name: course_schedule_drafts; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_schedule_drafts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "instructor_name" "text" NOT NULL,
    "topic" "text" NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "course_size" "text" DEFAULT 'large'::"text" NOT NULL,
    "color_index" smallint DEFAULT 0 NOT NULL,
    "scheduled_date" "date",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_schedule_drafts_color_index_check" CHECK ((("color_index" >= 0) AND ("color_index" <= 9))),
    CONSTRAINT "course_schedule_drafts_course_size_check" CHECK (("course_size" = ANY (ARRAY['large'::"text", 'small'::"text"]))),
    CONSTRAINT "course_schedule_drafts_instructor_name_check" CHECK ((("char_length"("instructor_name") >= 1) AND ("char_length"("instructor_name") <= 100))),
    CONSTRAINT "course_schedule_drafts_memo_check" CHECK (("char_length"("memo") <= 5000)),
    CONSTRAINT "course_schedule_drafts_topic_check" CHECK ((("char_length"("topic") >= 1) AND ("char_length"("topic") <= 200)))
);


ALTER TABLE "public"."course_schedule_drafts" OWNER TO "postgres";

--
-- Name: course_settlement_draft_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_settlement_draft_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_id" "uuid" NOT NULL,
    "cost_id" "text" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_settlement_draft_attachments_cost_id_check" CHECK ((("length"("cost_id") >= 1) AND ("length"("cost_id") <= 200))),
    CONSTRAINT "course_settlement_draft_attachments_file_size_check" CHECK (("file_size" > 0))
);


ALTER TABLE "public"."course_settlement_draft_attachments" OWNER TO "postgres";

--
-- Name: course_settlement_expense_attachments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_settlement_expense_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_id" "uuid" NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "mime_type" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_settlement_expense_attachments_file_size_check" CHECK (("file_size" > 0))
);


ALTER TABLE "public"."course_settlement_expense_attachments" OWNER TO "postgres";

--
-- Name: course_settlement_expenses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_settlement_expenses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "burden" "text" NOT NULL,
    "amount" bigint NOT NULL,
    "occurred_on" "date",
    "manager_name" "text" DEFAULT ''::"text" NOT NULL,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "evidence_required" boolean DEFAULT false NOT NULL,
    "evidence_type" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_settlement_expenses_amount_check" CHECK (("amount" >= 0)),
    CONSTRAINT "course_settlement_expenses_burden_check" CHECK (("burden" = ANY (ARRAY['company'::"text", 'instructor'::"text", 'shared'::"text"])))
);


ALTER TABLE "public"."course_settlement_expenses" OWNER TO "postgres";

--
-- Name: course_settlement_projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_settlement_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "course_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "starts_on" "date",
    "ends_on" "date",
    "settlement_months" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "manager_name" "text" DEFAULT ''::"text" NOT NULL,
    "memo" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT '자료대기'::"text" NOT NULL,
    "instructor_ratio_bps" integer DEFAULT 5000 NOT NULL,
    "latest_version" integer DEFAULT 0 NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "analysis_snapshot" "jsonb",
    "statement_draft" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    CONSTRAINT "course_settlement_projects_instructor_ratio_bps_check" CHECK ((("instructor_ratio_bps" >= 0) AND ("instructor_ratio_bps" <= 10000))),
    CONSTRAINT "course_settlement_projects_status_check" CHECK (("status" = ANY (ARRAY['자료대기'::"text", '자료업로드'::"text", '검증필요'::"text", '검증완료'::"text", '비용입력중'::"text", '정산검토'::"text", '정산확정'::"text", '지급완료'::"text"])))
);


ALTER TABLE "public"."course_settlement_projects" OWNER TO "postgres";

--
-- Name: course_settlement_uploads; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_settlement_uploads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_id" "uuid" NOT NULL,
    "source_type" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "checksum_sha256" "text" NOT NULL,
    "batch_id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "part_number" integer DEFAULT 1 NOT NULL,
    "part_count" integer DEFAULT 1 NOT NULL,
    "row_count" integer NOT NULL,
    "settlement_months" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "rows" "jsonb" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "storage_path" "text",
    "analysis_snapshot" "jsonb",
    "is_active" boolean DEFAULT true NOT NULL,
    "replaced_at" timestamp with time zone,
    CONSTRAINT "course_settlement_uploads_check" CHECK ((("part_count" > 0) AND ("part_number" <= "part_count"))),
    CONSTRAINT "course_settlement_uploads_part_number_check" CHECK (("part_number" > 0)),
    CONSTRAINT "course_settlement_uploads_row_count_check" CHECK (("row_count" > 0)),
    CONSTRAINT "course_settlement_uploads_rows_check" CHECK (("jsonb_typeof"("rows") = 'array'::"text")),
    CONSTRAINT "course_settlement_uploads_source_type_check" CHECK (("source_type" = ANY (ARRAY['nova'::"text", 'payment'::"text", 'workbook'::"text"])))
);


ALTER TABLE "public"."course_settlement_uploads" OWNER TO "postgres";

--
-- Name: course_settlement_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_settlement_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "input_snapshot" "jsonb" NOT NULL,
    "result_snapshot" "jsonb" NOT NULL,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'draft'::"text" NOT NULL,
    "calculated_by" "uuid" NOT NULL,
    "calculated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "confirmed_by" "uuid",
    "confirmed_at" timestamp with time zone,
    CONSTRAINT "course_settlement_versions_status_check" CHECK (("status" = ANY (ARRAY['draft'::"text", 'confirmed'::"text", 'reopened'::"text"])))
);


ALTER TABLE "public"."course_settlement_versions" OWNER TO "postgres";

--
-- Name: course_wbs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_wbs" (
    "course_id" "uuid" NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_wbs_items_check" CHECK (("jsonb_typeof"("items") = 'array'::"text"))
);


ALTER TABLE "public"."course_wbs" OWNER TO "postgres";

--
-- Name: course_wbs_people; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_wbs_people" (
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_wbs_people_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 500)))
);


ALTER TABLE "public"."course_wbs_people" OWNER TO "postgres";

--
-- Name: course_wbs_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_wbs_templates" (
    "workspace_id" "uuid" NOT NULL,
    "id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "items" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_wbs_templates_id_check" CHECK ((("char_length"("id") >= 1) AND ("char_length"("id") <= 120))),
    CONSTRAINT "course_wbs_templates_items_check" CHECK (("jsonb_typeof"("items") = 'array'::"text")),
    CONSTRAINT "course_wbs_templates_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 120)))
);


ALTER TABLE "public"."course_wbs_templates" OWNER TO "postgres";

--
-- Name: course_webinar_metrics; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_webinar_metrics" (
    "course_id" "uuid" NOT NULL,
    "group_chat_count" bigint,
    "communication_count" bigint,
    "live_start_count" bigint,
    "live_peak_count" bigint,
    "hours_to_peak" numeric,
    "live_end_count" bigint,
    "ad_spend" bigint,
    "payment_count" bigint,
    "revenue" bigint,
    "version" integer DEFAULT 1 NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "course_webinar_metrics_ad_spend_check" CHECK ((("ad_spend" >= 0) AND ("ad_spend" <= '1000000000000'::bigint))),
    CONSTRAINT "course_webinar_metrics_check" CHECK (("live_peak_count" >= "live_start_count")),
    CONSTRAINT "course_webinar_metrics_check1" CHECK (("live_peak_count" >= "live_end_count")),
    CONSTRAINT "course_webinar_metrics_communication_count_check" CHECK ((("communication_count" >= 0) AND ("communication_count" <= 1000000000))),
    CONSTRAINT "course_webinar_metrics_group_chat_count_check" CHECK ((("group_chat_count" >= 0) AND ("group_chat_count" <= 1000000000))),
    CONSTRAINT "course_webinar_metrics_hours_to_peak_check" CHECK (((("hours_to_peak" >= (0)::numeric) AND ("hours_to_peak" <= (1000)::numeric)) AND ("hours_to_peak" = "round"("hours_to_peak", 2)))),
    CONSTRAINT "course_webinar_metrics_live_end_count_check" CHECK ((("live_end_count" >= 0) AND ("live_end_count" <= 1000000000))),
    CONSTRAINT "course_webinar_metrics_live_peak_count_check" CHECK ((("live_peak_count" >= 0) AND ("live_peak_count" <= 1000000000))),
    CONSTRAINT "course_webinar_metrics_live_start_count_check" CHECK ((("live_start_count" >= 0) AND ("live_start_count" <= 1000000000))),
    CONSTRAINT "course_webinar_metrics_payment_count_check" CHECK ((("payment_count" >= 0) AND ("payment_count" <= 1000000000))),
    CONSTRAINT "course_webinar_metrics_revenue_check" CHECK ((("revenue" >= 0) AND ("revenue" <= '1000000000000'::bigint))),
    CONSTRAINT "course_webinar_metrics_version_check" CHECK (("version" > 0))
);


ALTER TABLE "public"."course_webinar_metrics" OWNER TO "postgres";

--
-- Name: course_youtube_appearances; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."course_youtube_appearances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "course_id" "uuid" NOT NULL,
    "channel_name" "text" NOT NULL,
    "channel_url" "text" NOT NULL,
    "video_url" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" smallint DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "landing_utm" "text" DEFAULT ''::"text" NOT NULL
);


ALTER TABLE "public"."course_youtube_appearances" OWNER TO "postgres";

--
-- Name: courses; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."courses" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "instructor_name" "text" NOT NULL,
    "free_webinar_at" timestamp with time zone NOT NULL,
    "starts_at" timestamp with time zone NOT NULL,
    "early_bird_event" "text" DEFAULT ''::"text" NOT NULL,
    "first_50_event" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "free_address_book_id" "uuid",
    "free_kakao_room_1_link" "text" DEFAULT ''::"text" NOT NULL,
    "free_kakao_room_2_link" "text" DEFAULT ''::"text" NOT NULL,
    "communication_room_link" "text" DEFAULT ''::"text" NOT NULL,
    "payment_link" "text" DEFAULT ''::"text" NOT NULL,
    "inquiry_link" "text" DEFAULT ''::"text" NOT NULL,
    "curriculum_link" "text" DEFAULT ''::"text" NOT NULL,
    "free_gift_link" "text" DEFAULT ''::"text" NOT NULL,
    "course_viewing_link" "text" DEFAULT ''::"text" NOT NULL,
    "required_tasks" "jsonb" DEFAULT '[{"key": "free-webinar-assets", "title": "무료특강 배너 + 상페", "dueDate": "", "completed": false}, {"key": "paid-course-assets", "title": "유료특강 배너 + 상페 + 동영상", "dueDate": "", "completed": false}, {"key": "course-materials", "title": "교안", "dueDate": "", "completed": false}]'::"jsonb" NOT NULL,
    "course_materials_link" "text" DEFAULT ''::"text" NOT NULL,
    "landing_page_link" "text" DEFAULT ''::"text" NOT NULL,
    "custom_links" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "banner_image_path" "text" DEFAULT ''::"text" NOT NULL,
    "course_differentiation" "text" DEFAULT ''::"text" NOT NULL,
    "order_roster_share_enabled" boolean DEFAULT false NOT NULL,
    "paid_kakao_room_link" "text" DEFAULT ''::"text" NOT NULL,
    "order_roster_share_masked" boolean DEFAULT true NOT NULL,
    "cohort" "text" DEFAULT ''::"text" NOT NULL,
    "nova_settled" boolean DEFAULT false NOT NULL,
    "instructor_settled" boolean DEFAULT false NOT NULL,
    CONSTRAINT "courses_custom_links_array_check" CHECK (("jsonb_typeof"("custom_links") = 'array'::"text")),
    CONSTRAINT "courses_required_tasks_array_check" CHECK (("jsonb_typeof"("required_tasks") = 'array'::"text"))
);


ALTER TABLE "public"."courses" OWNER TO "postgres";

--
-- Name: COLUMN "courses"."order_roster_share_enabled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."courses"."order_roster_share_enabled" IS 'Whether the signed public course order roster link is accessible.';


--
-- Name: COLUMN "courses"."cohort"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."courses"."cohort" IS '강의 기수';


--
-- Name: COLUMN "courses"."nova_settled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."courses"."nova_settled" IS '노바 정산 완료 여부';


--
-- Name: COLUMN "courses"."instructor_settled"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."courses"."instructor_settled" IS '강사 정산 완료 여부';


--
-- Name: hr_annual_leave_grants; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."hr_annual_leave_grants" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "grant_year" integer NOT NULL,
    "granted_days" numeric(4,1) NOT NULL,
    "employment_start_date" "date" NOT NULL,
    "granted_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_annual_leave_grants_grant_year_check" CHECK ((("grant_year" >= 2000) AND ("grant_year" <= 2100))),
    CONSTRAINT "hr_annual_leave_grants_granted_days_check" CHECK ((("granted_days" >= (0)::numeric) AND ("granted_days" <= (12)::numeric)))
);


ALTER TABLE "public"."hr_annual_leave_grants" OWNER TO "postgres";

--
-- Name: hr_leave_profiles; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."hr_leave_profiles" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "employment_start_date" "date" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "updated_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."hr_leave_profiles" OWNER TO "postgres";

--
-- Name: hr_leave_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."hr_leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "leave_date" "date" NOT NULL,
    "unit" "text" NOT NULL,
    "days" numeric(2,1) GENERATED ALWAYS AS (
CASE
    WHEN ("unit" = 'full'::"text") THEN 1.0
    ELSE 0.5
END) STORED,
    "reason" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_leave_requests_reason_check" CHECK (("length"("reason") <= 1000)),
    CONSTRAINT "hr_leave_requests_review_note_check" CHECK (("length"("review_note") <= 1000)),
    CONSTRAINT "hr_leave_requests_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "hr_leave_requests_unit_check" CHECK (("unit" = ANY (ARRAY['full'::"text", 'am'::"text", 'pm'::"text"])))
);


ALTER TABLE "public"."hr_leave_requests" OWNER TO "postgres";

--
-- Name: hr_leave_support_records; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."hr_leave_support_records" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "support_date" "date" NOT NULL,
    "support_type" "text" NOT NULL,
    "unit" "text" NOT NULL,
    "earned_days" numeric(2,1) GENERATED ALWAYS AS (
CASE
    WHEN ("support_type" = 'night_webinar'::"text") THEN 0.5
    WHEN ("unit" = 'full'::"text") THEN 1.0
    ELSE 0.5
END) STORED,
    "note" "text" DEFAULT ''::"text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone,
    "review_note" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "hr_leave_support_records_check" CHECK ((("support_type" <> 'night_webinar'::"text") OR ("unit" = 'half'::"text"))),
    CONSTRAINT "hr_leave_support_records_note_check" CHECK (("length"("note") <= 1000)),
    CONSTRAINT "hr_leave_support_records_review_note_check" CHECK (("length"("review_note") <= 1000)),
    CONSTRAINT "hr_leave_support_records_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'approved'::"text", 'rejected'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "hr_leave_support_records_support_type_check" CHECK (("support_type" = ANY (ARRAY['night_webinar'::"text", 'weekend_holiday'::"text"]))),
    CONSTRAINT "hr_leave_support_records_unit_check" CHECK (("unit" = ANY (ARRAY['half'::"text", 'full'::"text"])))
);


ALTER TABLE "public"."hr_leave_support_records" OWNER TO "postgres";

--
-- Name: import_errors; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."import_errors" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "version_id" "uuid" NOT NULL,
    "source_row_number" integer NOT NULL,
    "error_code" "text" NOT NULL,
    "field_name" "text",
    "original_value" "text",
    "resolved_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."import_errors" OWNER TO "postgres";

--
-- Name: job_enrollments; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."job_enrollments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "student_id" "uuid",
    "normalized_phone" "text",
    "normalized_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "original_values" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "source_row_number" integer NOT NULL,
    "is_duplicate" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_extra_participant" boolean DEFAULT false NOT NULL,
    "is_manually_added" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."job_enrollments" OWNER TO "postgres";

--
-- Name: job_file_versions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."job_file_versions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "job_id" "uuid" NOT NULL,
    "version" integer NOT NULL,
    "storage_path" "text" NOT NULL,
    "original_filename" "text" NOT NULL,
    "checksum_sha256" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mapping" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "row_count" integer DEFAULT 0 NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "applied_at" timestamp with time zone,
    CONSTRAINT "job_file_versions_file_size_check" CHECK (("file_size" > 0))
);


ALTER TABLE "public"."job_file_versions" OWNER TO "postgres";

--
-- Name: message_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "course_job_id" "uuid" NOT NULL,
    "job_version" integer NOT NULL,
    "template_key" "text" NOT NULL,
    "template_code" "text" NOT NULL,
    "target_scope" "text" NOT NULL,
    "idempotency_key" "text" NOT NULL,
    "status" "text" DEFAULT 'processing'::"text" NOT NULL,
    "requested_by" "uuid" NOT NULL,
    "requested_count" integer DEFAULT 0 NOT NULL,
    "success_count" integer DEFAULT 0 NOT NULL,
    "failed_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone,
    "provider" "text" DEFAULT 'shoong'::"text" NOT NULL,
    "delivery_checked_at" timestamp with time zone,
    CONSTRAINT "message_jobs_status_check" CHECK (("status" = ANY (ARRAY['processing'::"text", 'completed'::"text", 'partial_failed'::"text", 'failed'::"text"]))),
    CONSTRAINT "message_jobs_target_scope_check" CHECK (("target_scope" = ANY (ARRAY['all'::"text", 'filtered'::"text", 'selected'::"text"]))),
    CONSTRAINT "message_jobs_template_key_check" CHECK (("template_key" = ANY (ARRAY['paid_confirm'::"text", 'paid_invite'::"text"])))
);


ALTER TABLE "public"."message_jobs" OWNER TO "postgres";

--
-- Name: message_recipients; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_recipients" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_job_id" "uuid" NOT NULL,
    "enrollment_id" "uuid" NOT NULL,
    "normalized_phone" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "http_status" integer,
    "shoong_code" "text",
    "group_id" "text",
    "message_id" "text",
    "failure_reason" "text",
    "requested_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "provider" "text" DEFAULT 'shoong'::"text" NOT NULL,
    "provider_correlation_id" "text",
    "provider_status" "text",
    "provider_result_code" "text",
    "provider_result_message" "text",
    "final_message_type" "text",
    "delivery_checked_at" timestamp with time zone,
    "provider_batch_id" "uuid",
    "provider_seq" integer,
    CONSTRAINT "message_recipients_status_check" CHECK (("status" = ANY (ARRAY['pending'::"text", 'success'::"text", 'failed'::"text", 'unknown'::"text"])))
);


ALTER TABLE "public"."message_recipients" OWNER TO "postgres";

--
-- Name: message_studio_default_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_studio_default_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "position" smallint NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_studio_default_templates_position_check" CHECK ((("position" >= 1) AND ("position" <= 30)))
);


ALTER TABLE "public"."message_studio_default_templates" OWNER TO "postgres";

--
-- Name: message_studio_projects; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_studio_projects" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "course_name" "text" NOT NULL,
    "instructor_name" "text" DEFAULT ''::"text" NOT NULL,
    "course_features" "text" DEFAULT ''::"text" NOT NULL,
    "target_audience" "text" DEFAULT ''::"text" NOT NULL,
    "payment_link" "text" DEFAULT ''::"text" NOT NULL,
    "inquiry_link" "text" DEFAULT ''::"text" NOT NULL,
    "curriculum_link" "text" DEFAULT ''::"text" NOT NULL,
    "replay_link" "text" DEFAULT ''::"text" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "course_id" "uuid"
);


ALTER TABLE "public"."message_studio_projects" OWNER TO "postgres";

--
-- Name: message_studio_resources; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_studio_resources" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "project_id" "uuid" NOT NULL,
    "position" smallint NOT NULL,
    "example_text" "text" DEFAULT ''::"text" NOT NULL,
    "generated_text" "text" DEFAULT ''::"text" NOT NULL,
    "generation_count" integer DEFAULT 0 NOT NULL,
    "generated_model" "text",
    "generated_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "message_studio_resources_position_check" CHECK ((("position" >= 1) AND ("position" <= 30)))
);


ALTER TABLE "public"."message_studio_resources" OWNER TO "postgres";

--
-- Name: message_template_previews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_template_previews" (
    "workspace_id" "uuid" NOT NULL,
    "template_id" "text" NOT NULL,
    "body" "text" DEFAULT ''::"text" NOT NULL,
    CONSTRAINT "message_template_previews_body_check" CHECK (("char_length"("body") <= 10000))
);


ALTER TABLE "public"."message_template_previews" OWNER TO "postgres";

--
-- Name: message_templates; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."message_templates" (
    "id" "text" NOT NULL,
    "workspace_id" "uuid",
    "name" "text" NOT NULL,
    "template_code" "text" NOT NULL,
    "applicant_variable" "text" DEFAULT '신청자'::"text" NOT NULL,
    "course_variable" "text" DEFAULT '강좌명'::"text" NOT NULL,
    "is_system" boolean DEFAULT false NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "variable_names" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "preview_config" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "send_type" "text" DEFAULT 'at'::"text" NOT NULL,
    CONSTRAINT "message_templates_id_matches_code_check" CHECK (("id" = "template_code")),
    CONSTRAINT "message_templates_preview_config_object_check" CHECK (("jsonb_typeof"("preview_config") = 'object'::"text")),
    CONSTRAINT "message_templates_send_type_not_empty_check" CHECK (("length"(TRIM(BOTH FROM "send_type")) > 0)),
    CONSTRAINT "message_templates_variable_names_array_check" CHECK (("jsonb_typeof"("variable_names") = 'array'::"text"))
);


ALTER TABLE "public"."message_templates" OWNER TO "postgres";

--
-- Name: phone_sales_jobs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."phone_sales_jobs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "instructor_name" "text" NOT NULL,
    "free_filenames" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "paid_filenames" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "free_count" integer DEFAULT 0 NOT NULL,
    "paid_count" integer DEFAULT 0 NOT NULL,
    "excluded_count" integer DEFAULT 0 NOT NULL,
    "result_count" integer DEFAULT 0 NOT NULL,
    "contacts" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."phone_sales_jobs" OWNER TO "postgres";

--
-- Name: services; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."services" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "service_key" "text" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text" DEFAULT 'box'::"text" NOT NULL,
    "route" "text" NOT NULL,
    "status" "public"."service_status" DEFAULT 'coming_soon'::"public"."service_status" NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "allowed_roles" "public"."app_role"[] DEFAULT ARRAY['super_admin'::"public"."app_role", 'admin'::"public"."app_role", 'user'::"public"."app_role"] NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "services_route_check" CHECK (("route" ~ '^/[a-zA-Z0-9/_-]*$'::"text"))
);


ALTER TABLE "public"."services" OWNER TO "postgres";

--
-- Name: settlement_cost_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."settlement_cost_snapshots" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "settlement_id" "uuid" NOT NULL,
    "course_cost_id" "uuid",
    "cost_snapshot" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "settlement_cost_snapshots_cost_snapshot_check" CHECK (("jsonb_typeof"("cost_snapshot") = 'object'::"text"))
);


ALTER TABLE "public"."settlement_cost_snapshots" OWNER TO "postgres";

--
-- Name: settlement_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."settlement_reports" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "name" "text" NOT NULL,
    "original_filename" "text" DEFAULT ''::"text" NOT NULL,
    "row_count" integer NOT NULL,
    "rows" "jsonb" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "settlement_reports_name_check" CHECK ((("char_length"("name") >= 1) AND ("char_length"("name") <= 200))),
    CONSTRAINT "settlement_reports_row_count_check" CHECK (("row_count" > 0)),
    CONSTRAINT "settlement_reports_rows_check" CHECK (("jsonb_typeof"("rows") = 'array'::"text"))
);


ALTER TABLE "public"."settlement_reports" OWNER TO "postgres";

--
-- Name: students; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."students" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "normalized_phone" "text" NOT NULL,
    "name" "text",
    "email" "text",
    "profile" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."students" OWNER TO "postgres";

--
-- Name: work_daily_reports; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."work_daily_reports" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "content" "text" DEFAULT ''::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_daily_reports_content_check" CHECK (("char_length"("content") <= 10000))
);


ALTER TABLE "public"."work_daily_reports" OWNER TO "postgres";

--
-- Name: work_daily_reviews; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."work_daily_reviews" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "work_date" "date" NOT NULL,
    "incomplete_count" integer DEFAULT 0 NOT NULL,
    "checked_out_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_daily_reviews_incomplete_count_check" CHECK (("incomplete_count" >= 0))
);


ALTER TABLE "public"."work_daily_reviews" OWNER TO "postgres";

--
-- Name: work_task_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."work_task_events" (
    "id" bigint NOT NULL,
    "task_id" "uuid" NOT NULL,
    "actor_id" "uuid" NOT NULL,
    "event_type" "text" NOT NULL,
    "from_assignee_id" "uuid",
    "to_assignee_id" "uuid",
    "metadata" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_task_events_event_type_check" CHECK (("event_type" = ANY (ARRAY['created'::"text", 'completed'::"text", 'reopened'::"text", 'transferred'::"text", 'edited'::"text"])))
);


ALTER TABLE "public"."work_task_events" OWNER TO "postgres";

--
-- Name: work_task_events_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_task_events" ALTER COLUMN "id" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."work_task_events_id_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: work_tasks; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."work_tasks" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "planned_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "status" "text" DEFAULT 'open'::"text" NOT NULL,
    "creator_id" "uuid" NOT NULL,
    "assignee_id" "uuid" NOT NULL,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "work_tasks_status_check" CHECK (("status" = ANY (ARRAY['open'::"text", 'done'::"text", 'cancelled'::"text"]))),
    CONSTRAINT "work_tasks_title_check" CHECK ((("length"(TRIM(BOTH FROM "title")) >= 1) AND ("length"(TRIM(BOTH FROM "title")) <= 200)))
);


ALTER TABLE "public"."work_tasks" OWNER TO "postgres";

--
-- Name: workspace_members; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workspace_members" (
    "workspace_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "role" "public"."app_role" DEFAULT 'user'::"public"."app_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."workspace_members" OWNER TO "postgres";

--
-- Name: workspaces; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."workspaces" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "is_primary" boolean DEFAULT false NOT NULL
);


ALTER TABLE "public"."workspaces" OWNER TO "postgres";

--
-- Name: youtube_analysis_batches; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."youtube_analysis_batches" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workspace_id" "uuid" NOT NULL,
    "created_by" "uuid" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "input_count" integer NOT NULL,
    "unique_channel_count" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "completed_at" timestamp with time zone
);


ALTER TABLE "public"."youtube_analysis_batches" OWNER TO "postgres";

--
-- Name: youtube_analysis_requests; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."youtube_analysis_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "input_order" integer NOT NULL,
    "input_url" "text" NOT NULL,
    "status" "text" DEFAULT 'pending'::"text" NOT NULL,
    "resolved_channel_id" "text",
    "error_code" "text"
);


ALTER TABLE "public"."youtube_analysis_requests" OWNER TO "postgres";

--
-- Name: youtube_analysis_runs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."youtube_analysis_runs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "batch_id" "uuid" NOT NULL,
    "channel_id" "text" NOT NULL,
    "channel" "jsonb" NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "started_at" timestamp with time zone NOT NULL,
    "completed_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."youtube_analysis_runs" OWNER TO "postgres";

--
-- Name: TABLE "youtube_analysis_runs"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."youtube_analysis_runs" IS 'Legacy archive; replaced by youtube_analyzed_channels.';


--
-- Name: youtube_analyzed_channels; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."youtube_analyzed_channels" (
    "workspace_id" "uuid" NOT NULL,
    "position" bigint NOT NULL,
    "channel_id" "text" NOT NULL,
    "channel" "jsonb" NOT NULL,
    "metrics" "jsonb" NOT NULL,
    "warnings" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "first_analyzed_at" timestamp with time zone NOT NULL,
    "last_analysis_started_at" timestamp with time zone NOT NULL,
    "last_analyzed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "email" "text",
    "category" "text",
    "appearance_fee" bigint,
    "rs_percent" numeric,
    "memo" "text",
    "excluded_from_updates" boolean DEFAULT false NOT NULL,
    CONSTRAINT "youtube_analyzed_channels_appearance_fee_nonnegative" CHECK ((("appearance_fee" IS NULL) OR ("appearance_fee" >= 0))),
    CONSTRAINT "youtube_analyzed_channels_category_valid" CHECK ((("category" IS NULL) OR ("category" = ANY (ARRAY['타이탄 외부채널'::"text", '타이탄 내부채널'::"text", 'N잡 연구소 내부채널'::"text", 'N잡 연구소 협력채널'::"text", '휴먼스토리 산하채널'::"text", '레드락'::"text", '마브스쿨'::"text", 'N잡연구소'::"text", '인베이더스쿨'::"text", '쇼츠아재'::"text", '하이퍼클래스'::"text", '서과장쪽'::"text", '하이클래스'::"text"])))),
    CONSTRAINT "youtube_analyzed_channels_email_length" CHECK ((("email" IS NULL) OR (("email" = "btrim"("email")) AND (("char_length"("email") >= 3) AND ("char_length"("email") <= 254))))),
    CONSTRAINT "youtube_analyzed_channels_memo_length" CHECK ((("memo" IS NULL) OR ("char_length"("memo") <= 2000))),
    CONSTRAINT "youtube_analyzed_channels_rs_percent_range" CHECK ((("rs_percent" IS NULL) OR (("rs_percent" >= (0)::numeric) AND ("rs_percent" <= (100)::numeric))))
);


ALTER TABLE "public"."youtube_analyzed_channels" OWNER TO "postgres";

--
-- Name: COLUMN "youtube_analyzed_channels"."excluded_from_updates"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN "public"."youtube_analyzed_channels"."excluded_from_updates" IS 'When true, bulk channel and engagement updates skip this channel.';


--
-- Name: youtube_analyzed_channels_position_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_analyzed_channels" ALTER COLUMN "position" ADD GENERATED ALWAYS AS IDENTITY (
    SEQUENCE NAME "public"."youtube_analyzed_channels_position_seq"
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: youtube_channel_videos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."youtube_channel_videos" (
    "workspace_id" "uuid" NOT NULL,
    "channel_id" "text" NOT NULL,
    "video_id" "text" NOT NULL,
    "published_at" timestamp with time zone NOT NULL,
    "data" "jsonb" NOT NULL
);


ALTER TABLE "public"."youtube_channel_videos" OWNER TO "postgres";

--
-- Name: youtube_latest_analyses; Type: VIEW; Schema: public; Owner: postgres
--

CREATE VIEW "public"."youtube_latest_analyses" WITH ("security_invoker"='true') AS
 SELECT DISTINCT ON ("b"."workspace_id", "r"."channel_id") "r"."id",
    "r"."batch_id",
    "r"."channel_id",
    "r"."channel",
    "r"."metrics",
    "r"."warnings",
    "r"."started_at",
    "r"."completed_at",
    "b"."workspace_id"
   FROM ("public"."youtube_analysis_runs" "r"
     JOIN "public"."youtube_analysis_batches" "b" ON (("b"."id" = "r"."batch_id")))
  ORDER BY "b"."workspace_id", "r"."channel_id", "r"."completed_at" DESC, "r"."id" DESC;


ALTER VIEW "public"."youtube_latest_analyses" OWNER TO "postgres";

--
-- Name: youtube_video_snapshots; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE "public"."youtube_video_snapshots" (
    "run_id" "uuid" NOT NULL,
    "video_id" "text" NOT NULL,
    "published_at" timestamp with time zone NOT NULL,
    "data" "jsonb" NOT NULL
);


ALTER TABLE "public"."youtube_video_snapshots" OWNER TO "postgres";

--
-- Name: TABLE "youtube_video_snapshots"; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE "public"."youtube_video_snapshots" IS 'Legacy archive; replaced by youtube_channel_videos.';


--
-- Name: attendance attendance_employee_id_work_date_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."attendance"
    ADD CONSTRAINT "attendance_employee_id_work_date_key" UNIQUE ("employee_id", "work_date");


--
-- Name: attendance attendance_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."attendance"
    ADD CONSTRAINT "attendance_pkey" PRIMARY KEY ("id");


--
-- Name: audit audit_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."audit"
    ADD CONSTRAINT "audit_pkey" PRIMARY KEY ("id");


--
-- Name: commands commands_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."commands"
    ADD CONSTRAINT "commands_pkey" PRIMARY KEY ("employee_id", "request_key");


--
-- Name: comments comments_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."comments"
    ADD CONSTRAINT "comments_pkey" PRIMARY KEY ("id");


--
-- Name: corrections corrections_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."corrections"
    ADD CONSTRAINT "corrections_pkey" PRIMARY KEY ("id");


--
-- Name: employees employees_auth_id_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."employees"
    ADD CONSTRAINT "employees_auth_id_key" UNIQUE ("auth_id");


--
-- Name: employees employees_organization_id_id_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."employees"
    ADD CONSTRAINT "employees_organization_id_id_key" UNIQUE ("organization_id", "id");


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");


--
-- Name: invitations invitations_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."invitations"
    ADD CONSTRAINT "invitations_pkey" PRIMARY KEY ("id");


--
-- Name: leave_days leave_days_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leave_days"
    ADD CONSTRAINT "leave_days_pkey" PRIMARY KEY ("id");


--
-- Name: leaves leaves_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leaves"
    ADD CONSTRAINT "leaves_pkey" PRIMARY KEY ("id");


--
-- Name: notifications notifications_event_id_recipient_id_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."notifications"
    ADD CONSTRAINT "notifications_event_id_recipient_id_key" UNIQUE ("event_id", "recipient_id");


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."organizations"
    ADD CONSTRAINT "organizations_pkey" PRIMARY KEY ("id");


--
-- Name: outbox outbox_event_key_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."outbox"
    ADD CONSTRAINT "outbox_event_key_key" UNIQUE ("event_key");


--
-- Name: outbox outbox_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."outbox"
    ADD CONSTRAINT "outbox_pkey" PRIMARY KEY ("id");


--
-- Name: personnel_events personnel_events_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."personnel_events"
    ADD CONSTRAINT "personnel_events_pkey" PRIMARY KEY ("id");


--
-- Name: personnel personnel_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."personnel"
    ADD CONSTRAINT "personnel_pkey" PRIMARY KEY ("employee_id");


--
-- Name: policies policies_organization_id_version_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."policies"
    ADD CONSTRAINT "policies_organization_id_version_key" UNIQUE ("organization_id", "version");


--
-- Name: policies policies_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."policies"
    ADD CONSTRAINT "policies_pkey" PRIMARY KEY ("id");


--
-- Name: review_revisions review_revisions_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."review_revisions"
    ADD CONSTRAINT "review_revisions_pkey" PRIMARY KEY ("id");


--
-- Name: review_revisions review_revisions_review_id_revision_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."review_revisions"
    ADD CONSTRAINT "review_revisions_review_id_revision_key" UNIQUE ("review_id", "revision");


--
-- Name: reviews reviews_employee_id_work_date_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."reviews"
    ADD CONSTRAINT "reviews_employee_id_work_date_key" UNIQUE ("employee_id", "work_date");


--
-- Name: reviews reviews_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."reviews"
    ADD CONSTRAINT "reviews_pkey" PRIMARY KEY ("id");


--
-- Name: task_events task_events_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."task_events"
    ADD CONSTRAINT "task_events_pkey" PRIMARY KEY ("id");


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."tasks"
    ADD CONSTRAINT "tasks_pkey" PRIMARY KEY ("id");


--
-- Name: tasks tasks_task_number_key; Type: CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."tasks"
    ADD CONSTRAINT "tasks_task_number_key" UNIQUE ("task_number");


--
-- Name: employees employees_pkey; Type: CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");


--
-- Name: employees employees_workspace_id_email_key; Type: CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."employees"
    ADD CONSTRAINT "employees_workspace_id_email_key" UNIQUE ("workspace_id", "email");


--
-- Name: employees employees_workspace_id_user_id_key; Type: CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."employees"
    ADD CONSTRAINT "employees_workspace_id_user_id_key" UNIQUE ("workspace_id", "user_id");


--
-- Name: events events_pkey; Type: CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."events"
    ADD CONSTRAINT "events_pkey" PRIMARY KEY ("id");


--
-- Name: periods periods_pkey; Type: CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."periods"
    ADD CONSTRAINT "periods_pkey" PRIMARY KEY ("id");


--
-- Name: ad_performance_daily_metrics ad_performance_daily_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_daily_metrics"
    ADD CONSTRAINT "ad_performance_daily_metrics_pkey" PRIMARY KEY ("workspace_id", "metric_date");


--
-- Name: ad_performance_dashboard_metrics ad_performance_dashboard_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboard_metrics"
    ADD CONSTRAINT "ad_performance_dashboard_metrics_pkey" PRIMARY KEY ("dashboard_id", "metric_date");


--
-- Name: ad_performance_dashboards ad_performance_dashboards_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboards"
    ADD CONSTRAINT "ad_performance_dashboards_pkey" PRIMARY KEY ("id");


--
-- Name: ad_performance_dashboards ad_performance_dashboards_workspace_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboards"
    ADD CONSTRAINT "ad_performance_dashboards_workspace_id_course_id_key" UNIQUE ("workspace_id", "course_id");


--
-- Name: ad_performance_organic_channels ad_performance_organic_channels_dashboard_id_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_channels"
    ADD CONSTRAINT "ad_performance_organic_channels_dashboard_id_id_key" UNIQUE ("dashboard_id", "id");


--
-- Name: ad_performance_organic_channels ad_performance_organic_channels_dashboard_id_name_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_channels"
    ADD CONSTRAINT "ad_performance_organic_channels_dashboard_id_name_key" UNIQUE ("dashboard_id", "name");


--
-- Name: ad_performance_organic_channels ad_performance_organic_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_channels"
    ADD CONSTRAINT "ad_performance_organic_channels_pkey" PRIMARY KEY ("id");


--
-- Name: ad_performance_organic_metric_values ad_performance_organic_metric_values_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_metric_values"
    ADD CONSTRAINT "ad_performance_organic_metric_values_pkey" PRIMARY KEY ("dashboard_id", "channel_id", "metric_date");


--
-- Name: ad_performance_settings ad_performance_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_settings"
    ADD CONSTRAINT "ad_performance_settings_pkey" PRIMARY KEY ("workspace_id");


--
-- Name: address_book_contacts address_book_contacts_address_book_id_normalized_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_contacts"
    ADD CONSTRAINT "address_book_contacts_address_book_id_normalized_phone_key" UNIQUE ("address_book_id", "normalized_phone");


--
-- Name: address_book_contacts address_book_contacts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_contacts"
    ADD CONSTRAINT "address_book_contacts_pkey" PRIMARY KEY ("id");


--
-- Name: address_book_imports address_book_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_imports"
    ADD CONSTRAINT "address_book_imports_pkey" PRIMARY KEY ("id");


--
-- Name: address_book_message_jobs address_book_message_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_jobs"
    ADD CONSTRAINT "address_book_message_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: address_book_message_recipients address_book_message_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_recipients"
    ADD CONSTRAINT "address_book_message_recipients_pkey" PRIMARY KEY ("id");


--
-- Name: address_books address_books_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_books"
    ADD CONSTRAINT "address_books_pkey" PRIMARY KEY ("id");


--
-- Name: audit_logs audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id");


--
-- Name: cash_flow_course_plans cash_flow_course_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_course_plans"
    ADD CONSTRAINT "cash_flow_course_plans_pkey" PRIMARY KEY ("id");


--
-- Name: cash_flow_course_plans cash_flow_course_plans_workspace_id_course_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_course_plans"
    ADD CONSTRAINT "cash_flow_course_plans_workspace_id_course_id_key" UNIQUE ("workspace_id", "course_id");


--
-- Name: cash_flow_settings cash_flow_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_settings"
    ADD CONSTRAINT "cash_flow_settings_pkey" PRIMARY KEY ("workspace_id");


--
-- Name: course_cost_attachments course_cost_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_attachments"
    ADD CONSTRAINT "course_cost_attachments_pkey" PRIMARY KEY ("id");


--
-- Name: course_cost_attachments course_cost_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_attachments"
    ADD CONSTRAINT "course_cost_attachments_storage_path_key" UNIQUE ("storage_path");


--
-- Name: course_cost_audit_logs course_cost_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_audit_logs"
    ADD CONSTRAINT "course_cost_audit_logs_pkey" PRIMARY KEY ("id");


--
-- Name: course_costs course_costs_migrated_from_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_costs"
    ADD CONSTRAINT "course_costs_migrated_from_key" UNIQUE ("migrated_from");


--
-- Name: course_costs course_costs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_costs"
    ADD CONSTRAINT "course_costs_pkey" PRIMARY KEY ("id");


--
-- Name: course_instagram_materials course_instagram_materials_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_instagram_materials"
    ADD CONSTRAINT "course_instagram_materials_pkey" PRIMARY KEY ("course_id", "position");


--
-- Name: course_instagram_shares course_instagram_shares_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_instagram_shares"
    ADD CONSTRAINT "course_instagram_shares_pkey" PRIMARY KEY ("course_id");


--
-- Name: course_instagram_shares course_instagram_shares_public_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_instagram_shares"
    ADD CONSTRAINT "course_instagram_shares_public_id_key" UNIQUE ("public_id");


--
-- Name: course_job_invites course_job_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_job_invites"
    ADD CONSTRAINT "course_job_invites_pkey" PRIMARY KEY ("job_id", "option_name");


--
-- Name: course_job_notes course_job_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_job_notes"
    ADD CONSTRAINT "course_job_notes_pkey" PRIMARY KEY ("id");


--
-- Name: course_jobs course_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_jobs"
    ADD CONSTRAINT "course_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: course_live_videos course_live_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_live_videos"
    ADD CONSTRAINT "course_live_videos_pkey" PRIMARY KEY ("id");


--
-- Name: course_notes course_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_notes"
    ADD CONSTRAINT "course_notes_pkey" PRIMARY KEY ("id");


--
-- Name: course_options course_options_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_options"
    ADD CONSTRAINT "course_options_pkey" PRIMARY KEY ("id");


--
-- Name: course_order_imports course_order_imports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_order_imports"
    ADD CONSTRAINT "course_order_imports_pkey" PRIMARY KEY ("id");


--
-- Name: course_orders course_orders_course_id_record_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_orders"
    ADD CONSTRAINT "course_orders_course_id_record_key_key" UNIQUE ("course_id", "record_key");


--
-- Name: course_orders course_orders_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_orders"
    ADD CONSTRAINT "course_orders_pkey" PRIMARY KEY ("id");


--
-- Name: course_schedule_drafts course_schedule_drafts_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_schedule_drafts"
    ADD CONSTRAINT "course_schedule_drafts_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_draft_attachments course_settlement_draft_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_draft_attachments"
    ADD CONSTRAINT "course_settlement_draft_attachments_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_draft_attachments course_settlement_draft_attachments_storage_path_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_draft_attachments"
    ADD CONSTRAINT "course_settlement_draft_attachments_storage_path_key" UNIQUE ("storage_path");


--
-- Name: course_settlement_expense_attachments course_settlement_expense_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_expense_attachments"
    ADD CONSTRAINT "course_settlement_expense_attachments_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_expenses course_settlement_expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_expenses"
    ADD CONSTRAINT "course_settlement_expenses_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_projects course_settlement_projects_course_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_projects"
    ADD CONSTRAINT "course_settlement_projects_course_id_key" UNIQUE ("course_id");


--
-- Name: course_settlement_projects course_settlement_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_projects"
    ADD CONSTRAINT "course_settlement_projects_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_uploads course_settlement_uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_uploads"
    ADD CONSTRAINT "course_settlement_uploads_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_uploads course_settlement_uploads_settlement_id_source_type_checksu_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_uploads"
    ADD CONSTRAINT "course_settlement_uploads_settlement_id_source_type_checksu_key" UNIQUE ("settlement_id", "source_type", "checksum_sha256");


--
-- Name: course_settlement_versions course_settlement_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_versions"
    ADD CONSTRAINT "course_settlement_versions_pkey" PRIMARY KEY ("id");


--
-- Name: course_settlement_versions course_settlement_versions_settlement_id_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_versions"
    ADD CONSTRAINT "course_settlement_versions_settlement_id_version_key" UNIQUE ("settlement_id", "version");


--
-- Name: course_wbs_people course_wbs_people_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs_people"
    ADD CONSTRAINT "course_wbs_people_pkey" PRIMARY KEY ("workspace_id", "name");


--
-- Name: course_wbs course_wbs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs"
    ADD CONSTRAINT "course_wbs_pkey" PRIMARY KEY ("course_id");


--
-- Name: course_wbs_templates course_wbs_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs_templates"
    ADD CONSTRAINT "course_wbs_templates_pkey" PRIMARY KEY ("workspace_id", "id");


--
-- Name: course_webinar_metrics course_webinar_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_webinar_metrics"
    ADD CONSTRAINT "course_webinar_metrics_pkey" PRIMARY KEY ("course_id");


--
-- Name: course_youtube_appearances course_youtube_appearances_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_youtube_appearances"
    ADD CONSTRAINT "course_youtube_appearances_pkey" PRIMARY KEY ("id");


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_pkey" PRIMARY KEY ("id");


--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_annual_leave_grants"
    ADD CONSTRAINT "hr_annual_leave_grants_pkey" PRIMARY KEY ("id");


--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_workspace_id_user_id_grant_year_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_annual_leave_grants"
    ADD CONSTRAINT "hr_annual_leave_grants_workspace_id_user_id_grant_year_key" UNIQUE ("workspace_id", "user_id", "grant_year");


--
-- Name: hr_leave_profiles hr_leave_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_profiles"
    ADD CONSTRAINT "hr_leave_profiles_pkey" PRIMARY KEY ("workspace_id", "user_id");


--
-- Name: hr_leave_requests hr_leave_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_requests"
    ADD CONSTRAINT "hr_leave_requests_pkey" PRIMARY KEY ("id");


--
-- Name: hr_leave_support_records hr_leave_support_records_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_support_records"
    ADD CONSTRAINT "hr_leave_support_records_pkey" PRIMARY KEY ("id");


--
-- Name: import_errors import_errors_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."import_errors"
    ADD CONSTRAINT "import_errors_pkey" PRIMARY KEY ("id");


--
-- Name: job_enrollments job_enrollments_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_enrollments"
    ADD CONSTRAINT "job_enrollments_pkey" PRIMARY KEY ("id");


--
-- Name: job_file_versions job_file_versions_job_id_version_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_file_versions"
    ADD CONSTRAINT "job_file_versions_job_id_version_key" UNIQUE ("job_id", "version");


--
-- Name: job_file_versions job_file_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_file_versions"
    ADD CONSTRAINT "job_file_versions_pkey" PRIMARY KEY ("id");


--
-- Name: message_jobs message_jobs_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_jobs"
    ADD CONSTRAINT "message_jobs_idempotency_key_key" UNIQUE ("idempotency_key");


--
-- Name: message_jobs message_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_jobs"
    ADD CONSTRAINT "message_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: message_provider_batches message_provider_batches_address_book_message_job_id_chunk__key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_provider_batches"
    ADD CONSTRAINT "message_provider_batches_address_book_message_job_id_chunk__key" UNIQUE ("address_book_message_job_id", "chunk_index");


--
-- Name: message_provider_batches message_provider_batches_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_provider_batches"
    ADD CONSTRAINT "message_provider_batches_idempotency_key_key" UNIQUE ("idempotency_key");


--
-- Name: message_provider_batches message_provider_batches_message_job_id_chunk_index_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_provider_batches"
    ADD CONSTRAINT "message_provider_batches_message_job_id_chunk_index_key" UNIQUE ("message_job_id", "chunk_index");


--
-- Name: message_provider_batches message_provider_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_provider_batches"
    ADD CONSTRAINT "message_provider_batches_pkey" PRIMARY KEY ("id");


--
-- Name: message_recipients message_recipients_message_job_id_enrollment_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_recipients"
    ADD CONSTRAINT "message_recipients_message_job_id_enrollment_id_key" UNIQUE ("message_job_id", "enrollment_id");


--
-- Name: message_recipients message_recipients_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_recipients"
    ADD CONSTRAINT "message_recipients_pkey" PRIMARY KEY ("id");


--
-- Name: message_studio_default_templates message_studio_default_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_default_templates"
    ADD CONSTRAINT "message_studio_default_templates_pkey" PRIMARY KEY ("id");


--
-- Name: message_studio_default_templates message_studio_default_templates_workspace_id_position_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_default_templates"
    ADD CONSTRAINT "message_studio_default_templates_workspace_id_position_key" UNIQUE ("workspace_id", "position");


--
-- Name: message_studio_projects message_studio_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_projects"
    ADD CONSTRAINT "message_studio_projects_pkey" PRIMARY KEY ("id");


--
-- Name: message_studio_resources message_studio_resources_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_resources"
    ADD CONSTRAINT "message_studio_resources_pkey" PRIMARY KEY ("id");


--
-- Name: message_studio_resources message_studio_resources_project_id_position_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_resources"
    ADD CONSTRAINT "message_studio_resources_project_id_position_key" UNIQUE ("project_id", "position");


--
-- Name: message_template_previews message_template_previews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_template_previews"
    ADD CONSTRAINT "message_template_previews_pkey" PRIMARY KEY ("workspace_id", "template_id");


--
-- Name: message_templates message_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id");


--
-- Name: message_templates message_templates_workspace_id_template_code_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_workspace_id_template_code_key" UNIQUE ("workspace_id", "template_code");


--
-- Name: phone_sales_jobs phone_sales_jobs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_sales_jobs"
    ADD CONSTRAINT "phone_sales_jobs_pkey" PRIMARY KEY ("id");


--
-- Name: services services_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_pkey" PRIMARY KEY ("id");


--
-- Name: services services_service_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."services"
    ADD CONSTRAINT "services_service_key_key" UNIQUE ("service_key");


--
-- Name: settlement_cost_snapshots settlement_cost_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_cost_snapshots"
    ADD CONSTRAINT "settlement_cost_snapshots_pkey" PRIMARY KEY ("id");


--
-- Name: settlement_cost_snapshots settlement_cost_snapshots_settlement_id_course_cost_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_cost_snapshots"
    ADD CONSTRAINT "settlement_cost_snapshots_settlement_id_course_cost_id_key" UNIQUE ("settlement_id", "course_cost_id");


--
-- Name: settlement_reports settlement_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_reports"
    ADD CONSTRAINT "settlement_reports_pkey" PRIMARY KEY ("id");


--
-- Name: students students_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_pkey" PRIMARY KEY ("id");


--
-- Name: students students_workspace_id_normalized_phone_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_workspace_id_normalized_phone_key" UNIQUE ("workspace_id", "normalized_phone");


--
-- Name: work_daily_reports work_daily_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reports"
    ADD CONSTRAINT "work_daily_reports_pkey" PRIMARY KEY ("workspace_id", "user_id", "work_date");


--
-- Name: work_daily_reviews work_daily_reviews_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reviews"
    ADD CONSTRAINT "work_daily_reviews_pkey" PRIMARY KEY ("id");


--
-- Name: work_daily_reviews work_daily_reviews_workspace_id_user_id_work_date_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reviews"
    ADD CONSTRAINT "work_daily_reviews_workspace_id_user_id_work_date_key" UNIQUE ("workspace_id", "user_id", "work_date");


--
-- Name: work_task_events work_task_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_pkey" PRIMARY KEY ("id");


--
-- Name: work_tasks work_tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_tasks"
    ADD CONSTRAINT "work_tasks_pkey" PRIMARY KEY ("id");


--
-- Name: workspace_members workspace_members_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id", "user_id");


--
-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspaces"
    ADD CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id");


--
-- Name: youtube_analysis_batches youtube_analysis_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_batches"
    ADD CONSTRAINT "youtube_analysis_batches_pkey" PRIMARY KEY ("id");


--
-- Name: youtube_analysis_requests youtube_analysis_requests_batch_id_input_order_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_requests"
    ADD CONSTRAINT "youtube_analysis_requests_batch_id_input_order_key" UNIQUE ("batch_id", "input_order");


--
-- Name: youtube_analysis_requests youtube_analysis_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_requests"
    ADD CONSTRAINT "youtube_analysis_requests_pkey" PRIMARY KEY ("id");


--
-- Name: youtube_analysis_runs youtube_analysis_runs_batch_id_channel_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_runs"
    ADD CONSTRAINT "youtube_analysis_runs_batch_id_channel_id_key" UNIQUE ("batch_id", "channel_id");


--
-- Name: youtube_analysis_runs youtube_analysis_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_runs"
    ADD CONSTRAINT "youtube_analysis_runs_pkey" PRIMARY KEY ("id");


--
-- Name: youtube_analyzed_channels youtube_analyzed_channels_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analyzed_channels"
    ADD CONSTRAINT "youtube_analyzed_channels_pkey" PRIMARY KEY ("workspace_id", "channel_id");


--
-- Name: youtube_channel_videos youtube_channel_videos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_channel_videos"
    ADD CONSTRAINT "youtube_channel_videos_pkey" PRIMARY KEY ("workspace_id", "channel_id", "video_id");


--
-- Name: youtube_video_snapshots youtube_video_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_video_snapshots"
    ADD CONSTRAINT "youtube_video_snapshots_pkey" PRIMARY KEY ("run_id", "video_id");


--
-- Name: attendance_organization_id_work_date_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "attendance_organization_id_work_date_idx" ON "hr"."attendance" USING "btree" ("organization_id", "work_date");


--
-- Name: audit_organization_id_entity_type_entity_id_created_at_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "audit_organization_id_entity_type_entity_id_created_at_idx" ON "hr"."audit" USING "btree" ("organization_id", "entity_type", "entity_id", "created_at");


--
-- Name: hr_employee_current_email; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX "hr_employee_current_email" ON "hr"."employees" USING "btree" ("organization_id", "email") WHERE ("auth_deleted_at" IS NULL);


--
-- Name: hr_invitation_current_email; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX "hr_invitation_current_email" ON "hr"."invitations" USING "btree" ("organization_id", "email") WHERE ("auth_deleted_at" IS NULL);


--
-- Name: hr_leave_segment_unique; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX "hr_leave_segment_unique" ON "hr"."leave_days" USING "btree" ("employee_id", "day", "segment") WHERE "active";


--
-- Name: hr_one_open_attendance; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX "hr_one_open_attendance" ON "hr"."attendance" USING "btree" ("employee_id") WHERE ("check_out_at" IS NULL);


--
-- Name: hr_one_pending_correction; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE UNIQUE INDEX "hr_one_pending_correction" ON "hr"."corrections" USING "btree" ("employee_id", "work_date") WHERE ("status" = 'pending'::"text");


--
-- Name: leave_days_organization_id_day_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "leave_days_organization_id_day_idx" ON "hr"."leave_days" USING "btree" ("organization_id", "day") WHERE "active";


--
-- Name: notifications_recipient_id_created_at_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "notifications_recipient_id_created_at_idx" ON "hr"."notifications" USING "btree" ("recipient_id", "created_at" DESC);


--
-- Name: outbox_next_retry_at_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "outbox_next_retry_at_idx" ON "hr"."outbox" USING "btree" ("next_retry_at") WHERE ("processed_at" IS NULL);


--
-- Name: policies_organization_id_effective_from_version_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "policies_organization_id_effective_from_version_idx" ON "hr"."policies" USING "btree" ("organization_id", "effective_from" DESC, "version" DESC);


--
-- Name: task_events_actor_id_created_at_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "task_events_actor_id_created_at_idx" ON "hr"."task_events" USING "btree" ("actor_id", "created_at");


--
-- Name: task_events_task_id_created_at_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "task_events_task_id_created_at_idx" ON "hr"."task_events" USING "btree" ("task_id", "created_at");


--
-- Name: tasks_organization_id_assignee_id_planned_date_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "tasks_organization_id_assignee_id_planned_date_idx" ON "hr"."tasks" USING "btree" ("organization_id", "assignee_id", "planned_date");


--
-- Name: tasks_organization_id_updated_at_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "tasks_organization_id_updated_at_idx" ON "hr"."tasks" USING "btree" ("organization_id", "updated_at" DESC);


--
-- Name: tasks_watcher_ids_idx; Type: INDEX; Schema: hr; Owner: postgres
--

CREATE INDEX "tasks_watcher_ids_idx" ON "hr"."tasks" USING "gin" ("watcher_ids");


--
-- Name: personnel_one_current_period; Type: INDEX; Schema: personnel_private; Owner: postgres
--

CREATE UNIQUE INDEX "personnel_one_current_period" ON "personnel_private"."periods" USING "btree" ("employee_id") WHERE ("end_date" IS NULL);


--
-- Name: ad_performance_daily_metrics_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ad_performance_daily_metrics_date_idx" ON "public"."ad_performance_daily_metrics" USING "btree" ("workspace_id", "metric_date" DESC);


--
-- Name: ad_performance_dashboard_metrics_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ad_performance_dashboard_metrics_date_idx" ON "public"."ad_performance_dashboard_metrics" USING "btree" ("dashboard_id", "metric_date" DESC);


--
-- Name: ad_performance_dashboards_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ad_performance_dashboards_workspace_idx" ON "public"."ad_performance_dashboards" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: ad_performance_organic_channels_order_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ad_performance_organic_channels_order_idx" ON "public"."ad_performance_organic_channels" USING "btree" ("dashboard_id", "sort_order", "created_at");


--
-- Name: ad_performance_organic_metric_values_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "ad_performance_organic_metric_values_date_idx" ON "public"."ad_performance_organic_metric_values" USING "btree" ("dashboard_id", "metric_date");


--
-- Name: address_book_contacts_book_name_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_book_contacts_book_name_id_idx" ON "public"."address_book_contacts" USING "btree" ("address_book_id", "name", "id");


--
-- Name: address_book_imports_address_book_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_book_imports_address_book_id_idx" ON "public"."address_book_imports" USING "btree" ("address_book_id");


--
-- Name: address_book_message_jobs_book_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_book_message_jobs_book_created_idx" ON "public"."address_book_message_jobs" USING "btree" ("address_book_id", "created_at" DESC);


--
-- Name: address_book_message_jobs_course_job_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_book_message_jobs_course_job_idx" ON "public"."address_book_message_jobs" USING "btree" ("course_job_id") WHERE ("course_job_id" IS NOT NULL);


--
-- Name: address_book_message_recipients_contact_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_book_message_recipients_contact_id_idx" ON "public"."address_book_message_recipients" USING "btree" ("contact_id");


--
-- Name: address_book_message_recipients_message_job_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_book_message_recipients_message_job_id_idx" ON "public"."address_book_message_recipients" USING "btree" ("message_job_id");


--
-- Name: address_books_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "address_books_workspace_updated_idx" ON "public"."address_books" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: address_message_recipients_provider_batch_seq_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "address_message_recipients_provider_batch_seq_idx" ON "public"."address_book_message_recipients" USING "btree" ("provider_batch_id", "provider_seq") WHERE (("provider_batch_id" IS NOT NULL) AND ("provider_seq" IS NOT NULL));


--
-- Name: audit_logs_entity_event_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "audit_logs_entity_event_created_idx" ON "public"."audit_logs" USING "btree" ("entity_id", "event_type", "created_at" DESC);


--
-- Name: audit_logs_workspace_event_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "audit_logs_workspace_event_created_idx" ON "public"."audit_logs" USING "btree" ("workspace_id", "event_type", "created_at" DESC);


--
-- Name: cash_flow_course_plans_workspace_month_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "cash_flow_course_plans_workspace_month_idx" ON "public"."cash_flow_course_plans" USING "btree" ("workspace_id", "expected_month", "course_id");


--
-- Name: course_cost_attachments_cost_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_cost_attachments_cost_idx" ON "public"."course_cost_attachments" USING "btree" ("course_cost_id", "uploaded_at");


--
-- Name: course_cost_audit_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_cost_audit_course_idx" ON "public"."course_cost_audit_logs" USING "btree" ("course_id", "created_at" DESC);


--
-- Name: course_costs_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_costs_course_idx" ON "public"."course_costs" USING "btree" ("course_id", "burden_type", "paid_date", "created_at");


--
-- Name: course_job_notes_job_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_job_notes_job_created_idx" ON "public"."course_job_notes" USING "btree" ("course_job_id", "created_at" DESC);


--
-- Name: course_jobs_course_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_jobs_course_id_idx" ON "public"."course_jobs" USING "btree" ("course_id") WHERE ("course_id" IS NOT NULL);


--
-- Name: course_jobs_paid_course_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "course_jobs_paid_course_idx" ON "public"."course_jobs" USING "btree" ("course_id") WHERE "is_order_roster";


--
-- Name: course_jobs_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_jobs_workspace_updated_idx" ON "public"."course_jobs" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: course_live_videos_course_sort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_live_videos_course_sort_idx" ON "public"."course_live_videos" USING "btree" ("course_id", "sort_order");


--
-- Name: course_notes_course_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_notes_course_created_idx" ON "public"."course_notes" USING "btree" ("course_id", "created_at" DESC);


--
-- Name: course_options_course_sort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_options_course_sort_idx" ON "public"."course_options" USING "btree" ("course_id", "sort_order");


--
-- Name: course_order_imports_course_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_order_imports_course_created_idx" ON "public"."course_order_imports" USING "btree" ("course_id", "created_at" DESC);


--
-- Name: course_orders_course_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_orders_course_updated_idx" ON "public"."course_orders" USING "btree" ("course_id", "updated_at" DESC, "id");


--
-- Name: course_schedule_drafts_workspace_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_schedule_drafts_workspace_created_idx" ON "public"."course_schedule_drafts" USING "btree" ("workspace_id", "created_at", "id");


--
-- Name: course_schedule_drafts_workspace_scheduled_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_schedule_drafts_workspace_scheduled_idx" ON "public"."course_schedule_drafts" USING "btree" ("workspace_id", "scheduled_date") WHERE ("scheduled_date" IS NOT NULL);


--
-- Name: course_settlement_draft_attachments_cost_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_draft_attachments_cost_idx" ON "public"."course_settlement_draft_attachments" USING "btree" ("settlement_id", "cost_id", "created_at");


--
-- Name: course_settlement_expenses_project_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_expenses_project_idx" ON "public"."course_settlement_expenses" USING "btree" ("settlement_id", "burden", "created_at");


--
-- Name: course_settlement_projects_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_projects_workspace_idx" ON "public"."course_settlement_projects" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: course_settlement_uploads_active_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_uploads_active_idx" ON "public"."course_settlement_uploads" USING "btree" ("settlement_id", "is_active", "created_at" DESC);


--
-- Name: course_settlement_uploads_batch_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_uploads_batch_idx" ON "public"."course_settlement_uploads" USING "btree" ("settlement_id", "batch_id", "part_number");


--
-- Name: course_settlement_uploads_project_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_uploads_project_idx" ON "public"."course_settlement_uploads" USING "btree" ("settlement_id", "created_at" DESC);


--
-- Name: course_settlement_versions_project_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_settlement_versions_project_idx" ON "public"."course_settlement_versions" USING "btree" ("settlement_id", "version" DESC);


--
-- Name: course_wbs_templates_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_wbs_templates_workspace_updated_idx" ON "public"."course_wbs_templates" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: course_wbs_workspace_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_wbs_workspace_idx" ON "public"."course_wbs" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: course_youtube_appearances_course_sort_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "course_youtube_appearances_course_sort_idx" ON "public"."course_youtube_appearances" USING "btree" ("course_id", "sort_order");


--
-- Name: courses_free_address_book_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "courses_free_address_book_id_idx" ON "public"."courses" USING "btree" ("free_address_book_id") WHERE ("free_address_book_id" IS NOT NULL);


--
-- Name: courses_id_workspace_unique_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "courses_id_workspace_unique_idx" ON "public"."courses" USING "btree" ("id", "workspace_id");


--
-- Name: courses_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "courses_workspace_updated_idx" ON "public"."courses" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: hr_leave_requests_user_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "hr_leave_requests_user_date_idx" ON "public"."hr_leave_requests" USING "btree" ("workspace_id", "user_id", "leave_date" DESC);


--
-- Name: hr_leave_requests_workspace_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "hr_leave_requests_workspace_date_idx" ON "public"."hr_leave_requests" USING "btree" ("workspace_id", "leave_date", "status");


--
-- Name: hr_leave_support_user_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "hr_leave_support_user_date_idx" ON "public"."hr_leave_support_records" USING "btree" ("workspace_id", "user_id", "support_date" DESC);


--
-- Name: hr_leave_support_workspace_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "hr_leave_support_workspace_date_idx" ON "public"."hr_leave_support_records" USING "btree" ("workspace_id", "support_date", "status");


--
-- Name: job_enrollments_job_version_row_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "job_enrollments_job_version_row_idx" ON "public"."job_enrollments" USING "btree" ("job_id", "version", "source_row_number");


--
-- Name: job_enrollments_order_key_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "job_enrollments_order_key_idx" ON "public"."job_enrollments" USING "btree" ("job_id", "version", (("normalized_values" ->> 'orderRecordKey'::"text"))) WHERE (("normalized_values" ->> 'orderRecordKey'::"text") IS NOT NULL);


--
-- Name: job_file_versions_job_checksum_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "job_file_versions_job_checksum_idx" ON "public"."job_file_versions" USING "btree" ("job_id", "checksum_sha256");


--
-- Name: message_jobs_course_job_created_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_jobs_course_job_created_idx" ON "public"."message_jobs" USING "btree" ("course_job_id", "created_at" DESC);


--
-- Name: message_provider_batches_address_poll_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_provider_batches_address_poll_idx" ON "public"."message_provider_batches" USING "btree" ("address_book_message_job_id", "status", "delivery_checked_at") WHERE ("address_book_message_job_id" IS NOT NULL);


--
-- Name: message_provider_batches_roster_poll_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_provider_batches_roster_poll_idx" ON "public"."message_provider_batches" USING "btree" ("message_job_id", "status", "delivery_checked_at") WHERE ("message_job_id" IS NOT NULL);


--
-- Name: message_recipients_job_status_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_recipients_job_status_idx" ON "public"."message_recipients" USING "btree" ("message_job_id", "status");


--
-- Name: message_recipients_provider_batch_seq_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "message_recipients_provider_batch_seq_idx" ON "public"."message_recipients" USING "btree" ("provider_batch_id", "provider_seq") WHERE (("provider_batch_id" IS NOT NULL) AND ("provider_seq" IS NOT NULL));


--
-- Name: message_studio_default_templates_workspace_position_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_studio_default_templates_workspace_position_idx" ON "public"."message_studio_default_templates" USING "btree" ("workspace_id", "position");


--
-- Name: message_studio_projects_course_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_studio_projects_course_id_idx" ON "public"."message_studio_projects" USING "btree" ("course_id") WHERE ("course_id" IS NOT NULL);


--
-- Name: message_studio_projects_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_studio_projects_workspace_updated_idx" ON "public"."message_studio_projects" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: message_studio_resources_project_position_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "message_studio_resources_project_position_idx" ON "public"."message_studio_resources" USING "btree" ("project_id", "position");


--
-- Name: phone_sales_jobs_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "phone_sales_jobs_workspace_updated_idx" ON "public"."phone_sales_jobs" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: settlement_reports_workspace_updated_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "settlement_reports_workspace_updated_idx" ON "public"."settlement_reports" USING "btree" ("workspace_id", "updated_at" DESC);


--
-- Name: work_daily_reports_workspace_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "work_daily_reports_workspace_date_idx" ON "public"."work_daily_reports" USING "btree" ("workspace_id", "work_date" DESC, "user_id");


--
-- Name: work_daily_reviews_user_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "work_daily_reviews_user_date_idx" ON "public"."work_daily_reviews" USING "btree" ("workspace_id", "user_id", "work_date" DESC);


--
-- Name: work_task_events_task_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "work_task_events_task_idx" ON "public"."work_task_events" USING "btree" ("task_id", "created_at" DESC);


--
-- Name: work_tasks_assignee_date_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "work_tasks_assignee_date_idx" ON "public"."work_tasks" USING "btree" ("workspace_id", "assignee_id", "planned_date", "status");


--
-- Name: workspaces_single_primary_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "workspaces_single_primary_idx" ON "public"."workspaces" USING "btree" ("is_primary") WHERE "is_primary";


--
-- Name: youtube_analysis_batches_workspace_id_created_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "youtube_analysis_batches_workspace_id_created_at_idx" ON "public"."youtube_analysis_batches" USING "btree" ("workspace_id", "created_at" DESC);


--
-- Name: youtube_analysis_runs_channel_id_completed_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "youtube_analysis_runs_channel_id_completed_at_idx" ON "public"."youtube_analysis_runs" USING "btree" ("channel_id", "completed_at" DESC);


--
-- Name: youtube_analyzed_channels_update_candidates_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "youtube_analyzed_channels_update_candidates_idx" ON "public"."youtube_analyzed_channels" USING "btree" ("workspace_id", "position") WHERE ("excluded_from_updates" = false);


--
-- Name: youtube_analyzed_channels_workspace_id_position_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "youtube_analyzed_channels_workspace_id_position_idx" ON "public"."youtube_analyzed_channels" USING "btree" ("workspace_id", "position");


--
-- Name: youtube_channel_videos_workspace_id_channel_id_published_at_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "youtube_channel_videos_workspace_id_channel_id_published_at_idx" ON "public"."youtube_channel_videos" USING "btree" ("workspace_id", "channel_id", "published_at" DESC, "video_id");


--
-- Name: youtube_video_snapshots_run_id_published_at_video_id_idx; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "youtube_video_snapshots_run_id_published_at_video_id_idx" ON "public"."youtube_video_snapshots" USING "btree" ("run_id", "published_at" DESC, "video_id");


--
-- Name: attendance hr_attendance_employee_snapshot; Type: TRIGGER; Schema: hr; Owner: postgres
--

CREATE TRIGGER "hr_attendance_employee_snapshot" BEFORE INSERT ON "hr"."attendance" FOR EACH ROW EXECUTE FUNCTION "hr"."snapshot_attendance"();


--
-- Name: employees hr_employee_date_guard; Type: TRIGGER; Schema: hr; Owner: postgres
--

CREATE TRIGGER "hr_employee_date_guard" BEFORE UPDATE ON "hr"."employees" FOR EACH ROW EXECUTE FUNCTION "hr"."guard_employee_dates"();


--
-- Name: task_events hr_task_event_names; Type: TRIGGER; Schema: hr; Owner: postgres
--

CREATE TRIGGER "hr_task_event_names" BEFORE INSERT ON "hr"."task_events" FOR EACH ROW EXECUTE FUNCTION "hr"."snapshot_task_event"();


--
-- Name: course_jobs check_paid_roster_workspace; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "check_paid_roster_workspace" BEFORE INSERT OR UPDATE OF "course_id", "workspace_id", "is_order_roster" ON "public"."course_jobs" FOR EACH ROW EXECUTE FUNCTION "public"."check_paid_roster_workspace"();


--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_touch_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "hr_annual_leave_grants_touch_updated_at" BEFORE UPDATE ON "public"."hr_annual_leave_grants" FOR EACH ROW EXECUTE FUNCTION "public"."touch_hr_leave_updated_at"();


--
-- Name: hr_leave_profiles hr_leave_profiles_touch_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "hr_leave_profiles_touch_updated_at" BEFORE UPDATE ON "public"."hr_leave_profiles" FOR EACH ROW EXECUTE FUNCTION "public"."touch_hr_leave_updated_at"();


--
-- Name: hr_leave_requests hr_leave_requests_touch_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "hr_leave_requests_touch_updated_at" BEFORE UPDATE ON "public"."hr_leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."touch_hr_leave_updated_at"();


--
-- Name: hr_leave_support_records hr_leave_support_touch_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "hr_leave_support_touch_updated_at" BEFORE UPDATE ON "public"."hr_leave_support_records" FOR EACH ROW EXECUTE FUNCTION "public"."touch_hr_leave_updated_at"();


--
-- Name: hr_leave_requests personnel_leave_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "personnel_leave_guard" BEFORE INSERT ON "public"."hr_leave_requests" FOR EACH ROW EXECUTE FUNCTION "personnel_private"."guard_leave"();


--
-- Name: hr_leave_support_records personnel_support_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "personnel_support_guard" BEFORE INSERT ON "public"."hr_leave_support_records" FOR EACH ROW EXECUTE FUNCTION "personnel_private"."guard_leave"();


--
-- Name: work_tasks personnel_task_guard; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "personnel_task_guard" BEFORE INSERT OR UPDATE ON "public"."work_tasks" FOR EACH ROW EXECUTE FUNCTION "personnel_private"."guard_task"();


--
-- Name: course_schedule_drafts touch_course_schedule_draft_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "touch_course_schedule_draft_updated_at" BEFORE UPDATE ON "public"."course_schedule_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."touch_course_schedule_draft_updated_at"();


--
-- Name: course_wbs_templates touch_course_wbs_template_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "touch_course_wbs_template_updated_at" BEFORE UPDATE ON "public"."course_wbs_templates" FOR EACH ROW EXECUTE FUNCTION "public"."touch_course_wbs_updated_at"();


--
-- Name: course_wbs touch_course_wbs_updated_at; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "touch_course_wbs_updated_at" BEFORE UPDATE ON "public"."course_wbs" FOR EACH ROW EXECUTE FUNCTION "public"."touch_course_wbs_updated_at"();


--
-- Name: youtube_analysis_runs youtube_runs_immutable; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "youtube_runs_immutable" BEFORE DELETE OR UPDATE ON "public"."youtube_analysis_runs" FOR EACH ROW EXECUTE FUNCTION "public"."youtube_snapshot_immutable"();


--
-- Name: youtube_video_snapshots youtube_videos_immutable; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER "youtube_videos_immutable" BEFORE DELETE OR UPDATE ON "public"."youtube_video_snapshots" FOR EACH ROW EXECUTE FUNCTION "public"."youtube_snapshot_immutable"();


--
-- Name: attendance attendance_organization_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."attendance"
    ADD CONSTRAINT "attendance_organization_id_employee_id_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: attendance attendance_policy_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."attendance"
    ADD CONSTRAINT "attendance_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "hr"."policies"("id");


--
-- Name: audit audit_actor_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."audit"
    ADD CONSTRAINT "audit_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "hr"."employees"("id");


--
-- Name: audit audit_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."audit"
    ADD CONSTRAINT "audit_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: commands commands_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."commands"
    ADD CONSTRAINT "commands_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");


--
-- Name: comments comments_author_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."comments"
    ADD CONSTRAINT "comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "hr"."employees"("id");


--
-- Name: comments comments_task_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."comments"
    ADD CONSTRAINT "comments_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "hr"."tasks"("id");


--
-- Name: corrections corrections_organization_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."corrections"
    ADD CONSTRAINT "corrections_organization_id_employee_id_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: corrections corrections_record_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."corrections"
    ADD CONSTRAINT "corrections_record_id_fkey" FOREIGN KEY ("record_id") REFERENCES "hr"."attendance"("id");


--
-- Name: corrections corrections_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."corrections"
    ADD CONSTRAINT "corrections_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "hr"."employees"("id");


--
-- Name: employees employees_auth_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."employees"
    ADD CONSTRAINT "employees_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: employees employees_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."employees"
    ADD CONSTRAINT "employees_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: invitations invitations_auth_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."invitations"
    ADD CONSTRAINT "invitations_auth_id_fkey" FOREIGN KEY ("auth_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: invitations invitations_invited_by_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."invitations"
    ADD CONSTRAINT "invitations_invited_by_fkey" FOREIGN KEY ("invited_by") REFERENCES "hr"."employees"("id");


--
-- Name: invitations invitations_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."invitations"
    ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: leave_days leave_days_leave_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leave_days"
    ADD CONSTRAINT "leave_days_leave_id_fkey" FOREIGN KEY ("leave_id") REFERENCES "hr"."leaves"("id");


--
-- Name: leave_days leave_days_organization_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leave_days"
    ADD CONSTRAINT "leave_days_organization_id_employee_id_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: leave_days leave_days_policy_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leave_days"
    ADD CONSTRAINT "leave_days_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "hr"."policies"("id");


--
-- Name: leaves leaves_created_by_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leaves"
    ADD CONSTRAINT "leaves_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "hr"."employees"("id");


--
-- Name: leaves leaves_organization_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leaves"
    ADD CONSTRAINT "leaves_organization_id_employee_id_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: leaves leaves_updated_by_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."leaves"
    ADD CONSTRAINT "leaves_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "hr"."employees"("id");


--
-- Name: notifications notifications_event_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."notifications"
    ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "hr"."outbox"("id");


--
-- Name: notifications notifications_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."notifications"
    ADD CONSTRAINT "notifications_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: notifications notifications_recipient_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."notifications"
    ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "hr"."employees"("id");


--
-- Name: outbox outbox_actor_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."outbox"
    ADD CONSTRAINT "outbox_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "hr"."employees"("id");


--
-- Name: outbox outbox_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."outbox"
    ADD CONSTRAINT "outbox_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: personnel personnel_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."personnel"
    ADD CONSTRAINT "personnel_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");


--
-- Name: personnel_events personnel_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."personnel_events"
    ADD CONSTRAINT "personnel_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "hr"."employees"("id");


--
-- Name: personnel_events personnel_events_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."personnel_events"
    ADD CONSTRAINT "personnel_events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "hr"."employees"("id");


--
-- Name: policies policies_created_by_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."policies"
    ADD CONSTRAINT "policies_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "hr"."employees"("id");


--
-- Name: policies policies_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."policies"
    ADD CONSTRAINT "policies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: review_revisions review_revisions_review_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."review_revisions"
    ADD CONSTRAINT "review_revisions_review_id_fkey" FOREIGN KEY ("review_id") REFERENCES "hr"."reviews"("id");


--
-- Name: reviews reviews_organization_id_employee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."reviews"
    ADD CONSTRAINT "reviews_organization_id_employee_id_fkey" FOREIGN KEY ("organization_id", "employee_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: task_events task_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."task_events"
    ADD CONSTRAINT "task_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "hr"."employees"("id");


--
-- Name: task_events task_events_task_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."task_events"
    ADD CONSTRAINT "task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "hr"."tasks"("id");


--
-- Name: tasks tasks_organization_id_assignee_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."tasks"
    ADD CONSTRAINT "tasks_organization_id_assignee_id_fkey" FOREIGN KEY ("organization_id", "assignee_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: tasks tasks_organization_id_creator_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."tasks"
    ADD CONSTRAINT "tasks_organization_id_creator_id_fkey" FOREIGN KEY ("organization_id", "creator_id") REFERENCES "hr"."employees"("organization_id", "id");


--
-- Name: tasks tasks_organization_id_fkey; Type: FK CONSTRAINT; Schema: hr; Owner: postgres
--

ALTER TABLE ONLY "hr"."tasks"
    ADD CONSTRAINT "tasks_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "hr"."organizations"("id");


--
-- Name: employees employees_user_id_fkey; Type: FK CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."employees"
    ADD CONSTRAINT "employees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: employees employees_workspace_id_fkey; Type: FK CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."employees"
    ADD CONSTRAINT "employees_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");


--
-- Name: events events_actor_id_fkey; Type: FK CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."events"
    ADD CONSTRAINT "events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE RESTRICT;


--
-- Name: events events_employee_id_fkey; Type: FK CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."events"
    ADD CONSTRAINT "events_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "personnel_private"."employees"("id");


--
-- Name: periods periods_employee_id_fkey; Type: FK CONSTRAINT; Schema: personnel_private; Owner: postgres
--

ALTER TABLE ONLY "personnel_private"."periods"
    ADD CONSTRAINT "periods_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "personnel_private"."employees"("id");


--
-- Name: ad_performance_daily_metrics ad_performance_daily_metrics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_daily_metrics"
    ADD CONSTRAINT "ad_performance_daily_metrics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_daily_metrics ad_performance_daily_metrics_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_daily_metrics"
    ADD CONSTRAINT "ad_performance_daily_metrics_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_daily_metrics ad_performance_daily_metrics_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_daily_metrics"
    ADD CONSTRAINT "ad_performance_daily_metrics_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: ad_performance_dashboard_metrics ad_performance_dashboard_metrics_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboard_metrics"
    ADD CONSTRAINT "ad_performance_dashboard_metrics_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_dashboard_metrics ad_performance_dashboard_metrics_dashboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboard_metrics"
    ADD CONSTRAINT "ad_performance_dashboard_metrics_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "public"."ad_performance_dashboards"("id") ON DELETE CASCADE;


--
-- Name: ad_performance_dashboard_metrics ad_performance_dashboard_metrics_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboard_metrics"
    ADD CONSTRAINT "ad_performance_dashboard_metrics_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_dashboards ad_performance_dashboards_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboards"
    ADD CONSTRAINT "ad_performance_dashboards_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: ad_performance_dashboards ad_performance_dashboards_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboards"
    ADD CONSTRAINT "ad_performance_dashboards_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_dashboards ad_performance_dashboards_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboards"
    ADD CONSTRAINT "ad_performance_dashboards_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_dashboards ad_performance_dashboards_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_dashboards"
    ADD CONSTRAINT "ad_performance_dashboards_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: ad_performance_organic_channels ad_performance_organic_channels_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_channels"
    ADD CONSTRAINT "ad_performance_organic_channels_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_organic_channels ad_performance_organic_channels_dashboard_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_channels"
    ADD CONSTRAINT "ad_performance_organic_channels_dashboard_id_fkey" FOREIGN KEY ("dashboard_id") REFERENCES "public"."ad_performance_dashboards"("id") ON DELETE CASCADE;


--
-- Name: ad_performance_organic_metric_values ad_performance_organic_metric_val_dashboard_id_metric_date_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_metric_values"
    ADD CONSTRAINT "ad_performance_organic_metric_val_dashboard_id_metric_date_fkey" FOREIGN KEY ("dashboard_id", "metric_date") REFERENCES "public"."ad_performance_dashboard_metrics"("dashboard_id", "metric_date") ON DELETE CASCADE;


--
-- Name: ad_performance_organic_metric_values ad_performance_organic_metric_valu_dashboard_id_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_metric_values"
    ADD CONSTRAINT "ad_performance_organic_metric_valu_dashboard_id_channel_id_fkey" FOREIGN KEY ("dashboard_id", "channel_id") REFERENCES "public"."ad_performance_organic_channels"("dashboard_id", "id") ON DELETE CASCADE;


--
-- Name: ad_performance_organic_metric_values ad_performance_organic_metric_values_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_metric_values"
    ADD CONSTRAINT "ad_performance_organic_metric_values_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_organic_metric_values ad_performance_organic_metric_values_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_organic_metric_values"
    ADD CONSTRAINT "ad_performance_organic_metric_values_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_settings ad_performance_settings_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_settings"
    ADD CONSTRAINT "ad_performance_settings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_settings ad_performance_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_settings"
    ADD CONSTRAINT "ad_performance_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: ad_performance_settings ad_performance_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."ad_performance_settings"
    ADD CONSTRAINT "ad_performance_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: address_book_contacts address_book_contacts_address_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_contacts"
    ADD CONSTRAINT "address_book_contacts_address_book_id_fkey" FOREIGN KEY ("address_book_id") REFERENCES "public"."address_books"("id") ON DELETE CASCADE;


--
-- Name: address_book_imports address_book_imports_address_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_imports"
    ADD CONSTRAINT "address_book_imports_address_book_id_fkey" FOREIGN KEY ("address_book_id") REFERENCES "public"."address_books"("id") ON DELETE CASCADE;


--
-- Name: address_book_imports address_book_imports_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_imports"
    ADD CONSTRAINT "address_book_imports_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: address_book_message_jobs address_book_message_jobs_address_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_jobs"
    ADD CONSTRAINT "address_book_message_jobs_address_book_id_fkey" FOREIGN KEY ("address_book_id") REFERENCES "public"."address_books"("id") ON DELETE CASCADE;


--
-- Name: address_book_message_jobs address_book_message_jobs_course_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_jobs"
    ADD CONSTRAINT "address_book_message_jobs_course_job_id_fkey" FOREIGN KEY ("course_job_id") REFERENCES "public"."course_jobs"("id") ON DELETE CASCADE;


--
-- Name: address_book_message_jobs address_book_message_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_jobs"
    ADD CONSTRAINT "address_book_message_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");


--
-- Name: address_book_message_jobs address_book_message_jobs_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_jobs"
    ADD CONSTRAINT "address_book_message_jobs_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id");


--
-- Name: address_book_message_jobs address_book_message_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_jobs"
    ADD CONSTRAINT "address_book_message_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: address_book_message_recipients address_book_message_recipients_contact_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_recipients"
    ADD CONSTRAINT "address_book_message_recipients_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "public"."address_book_contacts"("id") ON DELETE SET NULL;


--
-- Name: address_book_message_recipients address_book_message_recipients_message_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_recipients"
    ADD CONSTRAINT "address_book_message_recipients_message_job_id_fkey" FOREIGN KEY ("message_job_id") REFERENCES "public"."address_book_message_jobs"("id") ON DELETE CASCADE;


--
-- Name: address_book_message_recipients address_book_message_recipients_provider_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_book_message_recipients"
    ADD CONSTRAINT "address_book_message_recipients_provider_batch_id_fkey" FOREIGN KEY ("provider_batch_id") REFERENCES "public"."message_provider_batches"("id") ON DELETE SET NULL;


--
-- Name: address_books address_books_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_books"
    ADD CONSTRAINT "address_books_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: address_books address_books_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."address_books"
    ADD CONSTRAINT "address_books_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: audit_logs audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: audit_logs audit_logs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."audit_logs"
    ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE SET NULL;


--
-- Name: cash_flow_course_plans cash_flow_course_plans_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_course_plans"
    ADD CONSTRAINT "cash_flow_course_plans_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: cash_flow_course_plans cash_flow_course_plans_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_course_plans"
    ADD CONSTRAINT "cash_flow_course_plans_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: cash_flow_course_plans cash_flow_course_plans_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_course_plans"
    ADD CONSTRAINT "cash_flow_course_plans_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: cash_flow_course_plans cash_flow_course_plans_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_course_plans"
    ADD CONSTRAINT "cash_flow_course_plans_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: cash_flow_settings cash_flow_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_settings"
    ADD CONSTRAINT "cash_flow_settings_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: cash_flow_settings cash_flow_settings_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."cash_flow_settings"
    ADD CONSTRAINT "cash_flow_settings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_cost_attachments course_cost_attachments_course_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_attachments"
    ADD CONSTRAINT "course_cost_attachments_course_cost_id_fkey" FOREIGN KEY ("course_cost_id") REFERENCES "public"."course_costs"("id") ON DELETE CASCADE;


--
-- Name: course_cost_attachments course_cost_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_attachments"
    ADD CONSTRAINT "course_cost_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: course_cost_audit_logs course_cost_audit_logs_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_audit_logs"
    ADD CONSTRAINT "course_cost_audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: course_cost_audit_logs course_cost_audit_logs_course_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_audit_logs"
    ADD CONSTRAINT "course_cost_audit_logs_course_cost_id_fkey" FOREIGN KEY ("course_cost_id") REFERENCES "public"."course_costs"("id") ON DELETE SET NULL;


--
-- Name: course_cost_audit_logs course_cost_audit_logs_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_cost_audit_logs"
    ADD CONSTRAINT "course_cost_audit_logs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_costs course_costs_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_costs"
    ADD CONSTRAINT "course_costs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_costs course_costs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_costs"
    ADD CONSTRAINT "course_costs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: course_costs course_costs_manager_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_costs"
    ADD CONSTRAINT "course_costs_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: course_costs course_costs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_costs"
    ADD CONSTRAINT "course_costs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: course_instagram_materials course_instagram_materials_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_instagram_materials"
    ADD CONSTRAINT "course_instagram_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_instagram_shares course_instagram_shares_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_instagram_shares"
    ADD CONSTRAINT "course_instagram_shares_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_job_invites course_job_invites_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_job_invites"
    ADD CONSTRAINT "course_job_invites_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."course_jobs"("id") ON DELETE CASCADE;


--
-- Name: course_job_notes course_job_notes_course_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_job_notes"
    ADD CONSTRAINT "course_job_notes_course_job_id_fkey" FOREIGN KEY ("course_job_id") REFERENCES "public"."course_jobs"("id") ON DELETE CASCADE;


--
-- Name: course_job_notes course_job_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_job_notes"
    ADD CONSTRAINT "course_job_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: course_jobs course_jobs_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_jobs"
    ADD CONSTRAINT "course_jobs_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;


--
-- Name: course_jobs course_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_jobs"
    ADD CONSTRAINT "course_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: course_jobs course_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_jobs"
    ADD CONSTRAINT "course_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_live_videos course_live_videos_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_live_videos"
    ADD CONSTRAINT "course_live_videos_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_notes course_notes_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_notes"
    ADD CONSTRAINT "course_notes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_notes course_notes_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_notes"
    ADD CONSTRAINT "course_notes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: course_options course_options_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_options"
    ADD CONSTRAINT "course_options_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_order_imports course_order_imports_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_order_imports"
    ADD CONSTRAINT "course_order_imports_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_order_imports course_order_imports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_order_imports"
    ADD CONSTRAINT "course_order_imports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: course_orders course_orders_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_orders"
    ADD CONSTRAINT "course_orders_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_orders course_orders_import_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_orders"
    ADD CONSTRAINT "course_orders_import_id_fkey" FOREIGN KEY ("import_id") REFERENCES "public"."course_order_imports"("id");


--
-- Name: course_schedule_drafts course_schedule_drafts_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_schedule_drafts"
    ADD CONSTRAINT "course_schedule_drafts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: course_schedule_drafts course_schedule_drafts_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_schedule_drafts"
    ADD CONSTRAINT "course_schedule_drafts_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_draft_attachments course_settlement_draft_attachments_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_draft_attachments"
    ADD CONSTRAINT "course_settlement_draft_attachments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."course_settlement_projects"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_draft_attachments course_settlement_draft_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_draft_attachments"
    ADD CONSTRAINT "course_settlement_draft_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_expense_attachments course_settlement_expense_attachments_expense_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_expense_attachments"
    ADD CONSTRAINT "course_settlement_expense_attachments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "public"."course_settlement_expenses"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_expense_attachments course_settlement_expense_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_expense_attachments"
    ADD CONSTRAINT "course_settlement_expense_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_expenses course_settlement_expenses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_expenses"
    ADD CONSTRAINT "course_settlement_expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_expenses course_settlement_expenses_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_expenses"
    ADD CONSTRAINT "course_settlement_expenses_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."course_settlement_projects"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_projects course_settlement_projects_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_projects"
    ADD CONSTRAINT "course_settlement_projects_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_projects course_settlement_projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_projects"
    ADD CONSTRAINT "course_settlement_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_projects course_settlement_projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_projects"
    ADD CONSTRAINT "course_settlement_projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_uploads course_settlement_uploads_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_uploads"
    ADD CONSTRAINT "course_settlement_uploads_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."course_settlement_projects"("id") ON DELETE CASCADE;


--
-- Name: course_settlement_uploads course_settlement_uploads_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_uploads"
    ADD CONSTRAINT "course_settlement_uploads_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_versions course_settlement_versions_calculated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_versions"
    ADD CONSTRAINT "course_settlement_versions_calculated_by_fkey" FOREIGN KEY ("calculated_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_versions course_settlement_versions_confirmed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_versions"
    ADD CONSTRAINT "course_settlement_versions_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "auth"."users"("id");


--
-- Name: course_settlement_versions course_settlement_versions_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_settlement_versions"
    ADD CONSTRAINT "course_settlement_versions_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."course_settlement_projects"("id") ON DELETE CASCADE;


--
-- Name: course_wbs course_wbs_course_id_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs"
    ADD CONSTRAINT "course_wbs_course_id_workspace_id_fkey" FOREIGN KEY ("course_id", "workspace_id") REFERENCES "public"."courses"("id", "workspace_id") ON DELETE CASCADE;


--
-- Name: course_wbs_people course_wbs_people_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs_people"
    ADD CONSTRAINT "course_wbs_people_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_wbs_templates course_wbs_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs_templates"
    ADD CONSTRAINT "course_wbs_templates_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: course_wbs_templates course_wbs_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs_templates"
    ADD CONSTRAINT "course_wbs_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_wbs course_wbs_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs"
    ADD CONSTRAINT "course_wbs_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id") ON DELETE SET NULL;


--
-- Name: course_wbs course_wbs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_wbs"
    ADD CONSTRAINT "course_wbs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: course_webinar_metrics course_webinar_metrics_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_webinar_metrics"
    ADD CONSTRAINT "course_webinar_metrics_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: course_youtube_appearances course_youtube_appearances_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."course_youtube_appearances"
    ADD CONSTRAINT "course_youtube_appearances_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE CASCADE;


--
-- Name: courses courses_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: courses courses_free_address_book_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_free_address_book_id_fkey" FOREIGN KEY ("free_address_book_id") REFERENCES "public"."address_books"("id") ON DELETE SET NULL;


--
-- Name: courses courses_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."courses"
    ADD CONSTRAINT "courses_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_granted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_annual_leave_grants"
    ADD CONSTRAINT "hr_annual_leave_grants_granted_by_fkey" FOREIGN KEY ("granted_by") REFERENCES "auth"."users"("id");


--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_annual_leave_grants"
    ADD CONSTRAINT "hr_annual_leave_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_annual_leave_grants"
    ADD CONSTRAINT "hr_annual_leave_grants_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hr_leave_profiles hr_leave_profiles_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_profiles"
    ADD CONSTRAINT "hr_leave_profiles_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: hr_leave_profiles hr_leave_profiles_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_profiles"
    ADD CONSTRAINT "hr_leave_profiles_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "auth"."users"("id");


--
-- Name: hr_leave_profiles hr_leave_profiles_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_profiles"
    ADD CONSTRAINT "hr_leave_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: hr_leave_profiles hr_leave_profiles_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_profiles"
    ADD CONSTRAINT "hr_leave_profiles_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hr_leave_requests hr_leave_requests_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_requests"
    ADD CONSTRAINT "hr_leave_requests_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");


--
-- Name: hr_leave_requests hr_leave_requests_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_requests"
    ADD CONSTRAINT "hr_leave_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: hr_leave_requests hr_leave_requests_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_requests"
    ADD CONSTRAINT "hr_leave_requests_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: hr_leave_support_records hr_leave_support_records_reviewed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_support_records"
    ADD CONSTRAINT "hr_leave_support_records_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "auth"."users"("id");


--
-- Name: hr_leave_support_records hr_leave_support_records_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_support_records"
    ADD CONSTRAINT "hr_leave_support_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: hr_leave_support_records hr_leave_support_records_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."hr_leave_support_records"
    ADD CONSTRAINT "hr_leave_support_records_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: import_errors import_errors_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."import_errors"
    ADD CONSTRAINT "import_errors_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "public"."job_file_versions"("id") ON DELETE CASCADE;


--
-- Name: job_enrollments job_enrollments_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_enrollments"
    ADD CONSTRAINT "job_enrollments_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."course_jobs"("id") ON DELETE CASCADE;


--
-- Name: job_enrollments job_enrollments_student_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_enrollments"
    ADD CONSTRAINT "job_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE SET NULL;


--
-- Name: job_file_versions job_file_versions_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_file_versions"
    ADD CONSTRAINT "job_file_versions_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "public"."course_jobs"("id") ON DELETE CASCADE;


--
-- Name: job_file_versions job_file_versions_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."job_file_versions"
    ADD CONSTRAINT "job_file_versions_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "auth"."users"("id");


--
-- Name: message_jobs message_jobs_course_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_jobs"
    ADD CONSTRAINT "message_jobs_course_job_id_fkey" FOREIGN KEY ("course_job_id") REFERENCES "public"."course_jobs"("id") ON DELETE CASCADE;


--
-- Name: message_jobs message_jobs_requested_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_jobs"
    ADD CONSTRAINT "message_jobs_requested_by_fkey" FOREIGN KEY ("requested_by") REFERENCES "auth"."users"("id");


--
-- Name: message_jobs message_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_jobs"
    ADD CONSTRAINT "message_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: message_provider_batches message_provider_batches_address_book_message_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_provider_batches"
    ADD CONSTRAINT "message_provider_batches_address_book_message_job_id_fkey" FOREIGN KEY ("address_book_message_job_id") REFERENCES "public"."address_book_message_jobs"("id") ON DELETE CASCADE;


--
-- Name: message_provider_batches message_provider_batches_message_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_provider_batches"
    ADD CONSTRAINT "message_provider_batches_message_job_id_fkey" FOREIGN KEY ("message_job_id") REFERENCES "public"."message_jobs"("id") ON DELETE CASCADE;


--
-- Name: message_recipients message_recipients_enrollment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_recipients"
    ADD CONSTRAINT "message_recipients_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "public"."job_enrollments"("id") ON DELETE CASCADE;


--
-- Name: message_recipients message_recipients_message_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_recipients"
    ADD CONSTRAINT "message_recipients_message_job_id_fkey" FOREIGN KEY ("message_job_id") REFERENCES "public"."message_jobs"("id") ON DELETE CASCADE;


--
-- Name: message_recipients message_recipients_provider_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_recipients"
    ADD CONSTRAINT "message_recipients_provider_batch_id_fkey" FOREIGN KEY ("provider_batch_id") REFERENCES "public"."message_provider_batches"("id") ON DELETE SET NULL;


--
-- Name: message_studio_default_templates message_studio_default_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_default_templates"
    ADD CONSTRAINT "message_studio_default_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: message_studio_default_templates message_studio_default_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_default_templates"
    ADD CONSTRAINT "message_studio_default_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: message_studio_projects message_studio_projects_course_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_projects"
    ADD CONSTRAINT "message_studio_projects_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE SET NULL;


--
-- Name: message_studio_projects message_studio_projects_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_projects"
    ADD CONSTRAINT "message_studio_projects_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: message_studio_projects message_studio_projects_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_projects"
    ADD CONSTRAINT "message_studio_projects_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: message_studio_resources message_studio_resources_project_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_studio_resources"
    ADD CONSTRAINT "message_studio_resources_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "public"."message_studio_projects"("id") ON DELETE CASCADE;


--
-- Name: message_template_previews message_template_previews_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_template_previews"
    ADD CONSTRAINT "message_template_previews_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "public"."message_templates"("id") ON DELETE CASCADE;


--
-- Name: message_template_previews message_template_previews_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_template_previews"
    ADD CONSTRAINT "message_template_previews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: message_templates message_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: message_templates message_templates_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."message_templates"
    ADD CONSTRAINT "message_templates_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: phone_sales_jobs phone_sales_jobs_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_sales_jobs"
    ADD CONSTRAINT "phone_sales_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: phone_sales_jobs phone_sales_jobs_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."phone_sales_jobs"
    ADD CONSTRAINT "phone_sales_jobs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: settlement_cost_snapshots settlement_cost_snapshots_course_cost_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_cost_snapshots"
    ADD CONSTRAINT "settlement_cost_snapshots_course_cost_id_fkey" FOREIGN KEY ("course_cost_id") REFERENCES "public"."course_costs"("id") ON DELETE SET NULL;


--
-- Name: settlement_cost_snapshots settlement_cost_snapshots_settlement_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_cost_snapshots"
    ADD CONSTRAINT "settlement_cost_snapshots_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "public"."course_settlement_projects"("id") ON DELETE CASCADE;


--
-- Name: settlement_reports settlement_reports_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_reports"
    ADD CONSTRAINT "settlement_reports_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: settlement_reports settlement_reports_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."settlement_reports"
    ADD CONSTRAINT "settlement_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: students students_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."students"
    ADD CONSTRAINT "students_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: work_daily_reports work_daily_reports_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reports"
    ADD CONSTRAINT "work_daily_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: work_daily_reports work_daily_reports_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reports"
    ADD CONSTRAINT "work_daily_reports_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: work_daily_reviews work_daily_reviews_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reviews"
    ADD CONSTRAINT "work_daily_reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: work_daily_reviews work_daily_reviews_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_daily_reviews"
    ADD CONSTRAINT "work_daily_reviews_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: work_task_events work_task_events_actor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "auth"."users"("id");


--
-- Name: work_task_events work_task_events_from_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_from_assignee_id_fkey" FOREIGN KEY ("from_assignee_id") REFERENCES "auth"."users"("id");


--
-- Name: work_task_events work_task_events_task_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "public"."work_tasks"("id") ON DELETE CASCADE;


--
-- Name: work_task_events work_task_events_to_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_task_events"
    ADD CONSTRAINT "work_task_events_to_assignee_id_fkey" FOREIGN KEY ("to_assignee_id") REFERENCES "auth"."users"("id");


--
-- Name: work_tasks work_tasks_assignee_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_tasks"
    ADD CONSTRAINT "work_tasks_assignee_id_fkey" FOREIGN KEY ("assignee_id") REFERENCES "auth"."users"("id");


--
-- Name: work_tasks work_tasks_creator_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_tasks"
    ADD CONSTRAINT "work_tasks_creator_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "auth"."users"("id");


--
-- Name: work_tasks work_tasks_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."work_tasks"
    ADD CONSTRAINT "work_tasks_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;


--
-- Name: workspace_members workspace_members_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."workspace_members"
    ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE CASCADE;


--
-- Name: youtube_analysis_batches youtube_analysis_batches_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_batches"
    ADD CONSTRAINT "youtube_analysis_batches_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");


--
-- Name: youtube_analysis_batches youtube_analysis_batches_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_batches"
    ADD CONSTRAINT "youtube_analysis_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");


--
-- Name: youtube_analysis_requests youtube_analysis_requests_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_requests"
    ADD CONSTRAINT "youtube_analysis_requests_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."youtube_analysis_batches"("id");


--
-- Name: youtube_analysis_runs youtube_analysis_runs_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analysis_runs"
    ADD CONSTRAINT "youtube_analysis_runs_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "public"."youtube_analysis_batches"("id");


--
-- Name: youtube_analyzed_channels youtube_analyzed_channels_workspace_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_analyzed_channels"
    ADD CONSTRAINT "youtube_analyzed_channels_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id");


--
-- Name: youtube_channel_videos youtube_channel_videos_workspace_id_channel_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_channel_videos"
    ADD CONSTRAINT "youtube_channel_videos_workspace_id_channel_id_fkey" FOREIGN KEY ("workspace_id", "channel_id") REFERENCES "public"."youtube_analyzed_channels"("workspace_id", "channel_id") ON DELETE CASCADE;


--
-- Name: youtube_video_snapshots youtube_video_snapshots_run_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY "public"."youtube_video_snapshots"
    ADD CONSTRAINT "youtube_video_snapshots_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "public"."youtube_analysis_runs"("id");


--
-- Name: attendance; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."attendance" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."audit" ENABLE ROW LEVEL SECURITY;

--
-- Name: commands; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."commands" ENABLE ROW LEVEL SECURITY;

--
-- Name: comments; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."comments" ENABLE ROW LEVEL SECURITY;

--
-- Name: corrections; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."corrections" ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."employees" ENABLE ROW LEVEL SECURITY;

--
-- Name: invitations; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."invitations" ENABLE ROW LEVEL SECURITY;

--
-- Name: leave_days; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."leave_days" ENABLE ROW LEVEL SECURITY;

--
-- Name: leaves; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."leaves" ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."notifications" ENABLE ROW LEVEL SECURITY;

--
-- Name: organizations; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."organizations" ENABLE ROW LEVEL SECURITY;

--
-- Name: outbox; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."outbox" ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."personnel" ENABLE ROW LEVEL SECURITY;

--
-- Name: personnel_events; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."personnel_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: policies; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."policies" ENABLE ROW LEVEL SECURITY;

--
-- Name: review_revisions; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."review_revisions" ENABLE ROW LEVEL SECURITY;

--
-- Name: reviews; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: task_events; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."task_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks; Type: ROW SECURITY; Schema: hr; Owner: postgres
--

ALTER TABLE "hr"."tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: employees; Type: ROW SECURITY; Schema: personnel_private; Owner: postgres
--

ALTER TABLE "personnel_private"."employees" ENABLE ROW LEVEL SECURITY;

--
-- Name: events; Type: ROW SECURITY; Schema: personnel_private; Owner: postgres
--

ALTER TABLE "personnel_private"."events" ENABLE ROW LEVEL SECURITY;

--
-- Name: periods; Type: ROW SECURITY; Schema: personnel_private; Owner: postgres
--

ALTER TABLE "personnel_private"."periods" ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_performance_daily_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ad_performance_daily_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_performance_dashboard_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ad_performance_dashboard_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_performance_dashboards; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ad_performance_dashboards" ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_performance_organic_channels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ad_performance_organic_channels" ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_performance_organic_metric_values; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ad_performance_organic_metric_values" ENABLE ROW LEVEL SECURITY;

--
-- Name: ad_performance_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."ad_performance_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: address_book_contacts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."address_book_contacts" ENABLE ROW LEVEL SECURITY;

--
-- Name: address_book_imports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."address_book_imports" ENABLE ROW LEVEL SECURITY;

--
-- Name: address_book_message_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."address_book_message_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: address_book_message_recipients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."address_book_message_recipients" ENABLE ROW LEVEL SECURITY;

--
-- Name: address_books; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."address_books" ENABLE ROW LEVEL SECURITY;

--
-- Name: audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: services authenticated users read services; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authenticated users read services" ON "public"."services" FOR SELECT TO "authenticated" USING (true);


--
-- Name: course_job_notes authors delete own course job notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authors delete own course job notes" ON "public"."course_job_notes" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "course_job_notes"."course_job_id") AND "public"."is_workspace_member"("j"."workspace_id"))))));


--
-- Name: course_notes authors delete own course notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authors delete own course notes" ON "public"."course_notes" FOR DELETE TO "authenticated" USING ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_notes"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))));


--
-- Name: course_job_notes authors update own course job notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authors update own course job notes" ON "public"."course_job_notes" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "course_job_notes"."course_job_id") AND "public"."is_workspace_member"("j"."workspace_id")))))) WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "course_job_notes"."course_job_id") AND "public"."is_workspace_member"("j"."workspace_id"))))));


--
-- Name: course_notes authors update own course notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "authors update own course notes" ON "public"."course_notes" FOR UPDATE TO "authenticated" USING ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_notes"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))))) WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_notes"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))));


--
-- Name: cash_flow_course_plans; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cash_flow_course_plans" ENABLE ROW LEVEL SECURITY;

--
-- Name: cash_flow_settings; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."cash_flow_settings" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_cost_attachments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_cost_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_cost_audit_logs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_cost_audit_logs" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_costs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_costs" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_instagram_materials; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_instagram_materials" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_instagram_shares; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_instagram_shares" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_job_invites; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_job_invites" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_job_invites course_job_invites_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "course_job_invites_member_read" ON "public"."course_job_invites" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."course_jobs" "j"
     JOIN "public"."workspace_members" "m" ON (("m"."workspace_id" = "j"."workspace_id")))
  WHERE (("j"."id" = "course_job_invites"."job_id") AND ("m"."user_id" = "auth"."uid"())))));


--
-- Name: course_job_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_job_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_live_videos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_live_videos" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_notes; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_notes" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_options; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_options" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_order_imports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_order_imports" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_order_imports course_order_imports_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "course_order_imports_member_read" ON "public"."course_order_imports" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."courses" "c"
     JOIN "public"."workspace_members" "m" ON (("m"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "course_order_imports"."course_id") AND ("m"."user_id" = "auth"."uid"())))));


--
-- Name: course_orders; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_orders" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_orders course_orders_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "course_orders_member_read" ON "public"."course_orders" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."courses" "c"
     JOIN "public"."workspace_members" "m" ON (("m"."workspace_id" = "c"."workspace_id")))
  WHERE (("c"."id" = "course_orders"."course_id") AND ("m"."user_id" = "auth"."uid"())))));


--
-- Name: course_schedule_drafts; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_schedule_drafts" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_settlement_draft_attachments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_settlement_draft_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_settlement_expense_attachments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_settlement_expense_attachments" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_settlement_expenses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_settlement_expenses" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_settlement_projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_settlement_projects" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_settlement_uploads; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_settlement_uploads" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_settlement_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_settlement_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_wbs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_wbs" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_wbs_people; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_wbs_people" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_wbs_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_wbs_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_webinar_metrics; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_webinar_metrics" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_youtube_appearances; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."course_youtube_appearances" ENABLE ROW LEVEL SECURITY;

--
-- Name: courses; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."courses" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_annual_leave_grants; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hr_annual_leave_grants" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_annual_leave_grants hr_annual_leave_grants_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hr_annual_leave_grants_member_read" ON "public"."hr_annual_leave_grants" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "member"
  WHERE (("member"."workspace_id" = "hr_annual_leave_grants"."workspace_id") AND ("member"."user_id" = "auth"."uid"()) AND ("member"."role" = ANY (ARRAY['admin'::"public"."app_role", 'super_admin'::"public"."app_role"]))))))));


--
-- Name: hr_leave_profiles; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hr_leave_profiles" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_leave_profiles hr_leave_profiles_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hr_leave_profiles_member_read" ON "public"."hr_leave_profiles" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "member"
  WHERE (("member"."workspace_id" = "hr_leave_profiles"."workspace_id") AND ("member"."user_id" = "auth"."uid"()) AND ("member"."role" = ANY (ARRAY['admin'::"public"."app_role", 'super_admin'::"public"."app_role"]))))))));


--
-- Name: hr_leave_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hr_leave_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_leave_requests hr_leave_requests_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hr_leave_requests_member_read" ON "public"."hr_leave_requests" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "member"
  WHERE (("member"."workspace_id" = "hr_leave_requests"."workspace_id") AND ("member"."user_id" = "auth"."uid"()) AND ("member"."role" = ANY (ARRAY['admin'::"public"."app_role", 'super_admin'::"public"."app_role"]))))))));


--
-- Name: hr_leave_support_records hr_leave_support_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "hr_leave_support_member_read" ON "public"."hr_leave_support_records" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND (("user_id" = "auth"."uid"()) OR (EXISTS ( SELECT 1
   FROM "public"."workspace_members" "member"
  WHERE (("member"."workspace_id" = "hr_leave_support_records"."workspace_id") AND ("member"."user_id" = "auth"."uid"()) AND ("member"."role" = ANY (ARRAY['admin'::"public"."app_role", 'super_admin'::"public"."app_role"]))))))));


--
-- Name: hr_leave_support_records; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."hr_leave_support_records" ENABLE ROW LEVEL SECURITY;

--
-- Name: import_errors; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."import_errors" ENABLE ROW LEVEL SECURITY;

--
-- Name: job_enrollments; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."job_enrollments" ENABLE ROW LEVEL SECURITY;

--
-- Name: job_file_versions; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."job_file_versions" ENABLE ROW LEVEL SECURITY;

--
-- Name: course_schedule_drafts members create course schedule drafts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create course schedule drafts" ON "public"."course_schedule_drafts" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: job_file_versions members create file versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create file versions" ON "public"."job_file_versions" FOR INSERT TO "authenticated" WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "job_file_versions"."job_id") AND "public"."is_workspace_member"("j"."workspace_id")))) AND ("uploaded_by" = "auth"."uid"())));


--
-- Name: course_jobs members create jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create jobs" ON "public"."course_jobs" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: course_job_notes members create own course job notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create own course job notes" ON "public"."course_job_notes" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "course_job_notes"."course_job_id") AND "public"."is_workspace_member"("j"."workspace_id"))))));


--
-- Name: course_notes members create own course notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create own course notes" ON "public"."course_notes" FOR INSERT TO "authenticated" WITH CHECK ((("created_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_notes"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))));


--
-- Name: phone_sales_jobs members create phone sales jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members create phone sales jobs" ON "public"."phone_sales_jobs" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: course_schedule_drafts members delete course schedule drafts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members delete course schedule drafts" ON "public"."course_schedule_drafts" FOR DELETE TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: phone_sales_jobs members delete phone sales jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members delete phone sales jobs" ON "public"."phone_sales_jobs" FOR DELETE TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: ad_performance_daily_metrics members manage ad performance daily metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage ad performance daily metrics" ON "public"."ad_performance_daily_metrics" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: ad_performance_organic_channels members manage ad performance organic channels; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage ad performance organic channels" ON "public"."ad_performance_organic_channels" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ad_performance_dashboards"
  WHERE (("ad_performance_dashboards"."id" = "ad_performance_organic_channels"."dashboard_id") AND "public"."is_workspace_member"("ad_performance_dashboards"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ad_performance_dashboards"
  WHERE (("ad_performance_dashboards"."id" = "ad_performance_organic_channels"."dashboard_id") AND "public"."is_workspace_member"("ad_performance_dashboards"."workspace_id")))));


--
-- Name: ad_performance_organic_metric_values members manage ad performance organic values; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage ad performance organic values" ON "public"."ad_performance_organic_metric_values" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ad_performance_dashboards"
  WHERE (("ad_performance_dashboards"."id" = "ad_performance_organic_metric_values"."dashboard_id") AND "public"."is_workspace_member"("ad_performance_dashboards"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ad_performance_dashboards"
  WHERE (("ad_performance_dashboards"."id" = "ad_performance_organic_metric_values"."dashboard_id") AND "public"."is_workspace_member"("ad_performance_dashboards"."workspace_id")))));


--
-- Name: ad_performance_settings members manage ad performance settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage ad performance settings" ON "public"."ad_performance_settings" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: address_books members manage address books; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage address books" ON "public"."address_books" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: address_book_contacts members manage address contacts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage address contacts" ON "public"."address_book_contacts" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."address_books" "b"
  WHERE (("b"."id" = "address_book_contacts"."address_book_id") AND "public"."is_workspace_member"("b"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."address_books" "b"
  WHERE (("b"."id" = "address_book_contacts"."address_book_id") AND "public"."is_workspace_member"("b"."workspace_id")))));


--
-- Name: cash_flow_course_plans members manage cash flow course plans; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage cash flow course plans" ON "public"."cash_flow_course_plans" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("updated_by" = "auth"."uid"()) AND (EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "cash_flow_course_plans"."course_id") AND ("c"."workspace_id" = "cash_flow_course_plans"."workspace_id"))))));


--
-- Name: cash_flow_settings members manage cash flow settings; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage cash flow settings" ON "public"."cash_flow_settings" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("updated_by" = "auth"."uid"())));


--
-- Name: ad_performance_dashboards members manage course ad performance dashboards; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course ad performance dashboards" ON "public"."ad_performance_dashboards" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."courses"
  WHERE (("courses"."id" = "ad_performance_dashboards"."course_id") AND ("courses"."workspace_id" = "ad_performance_dashboards"."workspace_id"))))));


--
-- Name: ad_performance_dashboard_metrics members manage course ad performance metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course ad performance metrics" ON "public"."ad_performance_dashboard_metrics" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."ad_performance_dashboards"
  WHERE (("ad_performance_dashboards"."id" = "ad_performance_dashboard_metrics"."dashboard_id") AND "public"."is_workspace_member"("ad_performance_dashboards"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."ad_performance_dashboards"
  WHERE (("ad_performance_dashboards"."id" = "ad_performance_dashboard_metrics"."dashboard_id") AND "public"."is_workspace_member"("ad_performance_dashboards"."workspace_id")))));


--
-- Name: course_cost_attachments members manage course cost attachments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course cost attachments" ON "public"."course_cost_attachments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."course_costs" "x"
     JOIN "public"."courses" "c" ON (("c"."id" = "x"."course_id")))
  WHERE (("x"."id" = "course_cost_attachments"."course_cost_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."course_costs" "x"
     JOIN "public"."courses" "c" ON (("c"."id" = "x"."course_id")))
  WHERE (("x"."id" = "course_cost_attachments"."course_cost_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_costs members manage course costs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course costs" ON "public"."course_costs" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_costs"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_costs"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_instagram_materials members manage course instagram materials; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course instagram materials" ON "public"."course_instagram_materials" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_instagram_materials"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_instagram_materials"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_instagram_shares members manage course instagram shares; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course instagram shares" ON "public"."course_instagram_shares" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_instagram_shares"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_instagram_shares"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_live_videos members manage course live videos; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course live videos" ON "public"."course_live_videos" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_live_videos"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_live_videos"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_options members manage course options; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course options" ON "public"."course_options" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_options"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_options"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_settlement_draft_attachments members manage course settlement draft attachments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course settlement draft attachments" ON "public"."course_settlement_draft_attachments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_draft_attachments"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id"))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_draft_attachments"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id")))) AND ("uploaded_by" = "auth"."uid"())));


--
-- Name: course_settlement_expenses members manage course settlement expenses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course settlement expenses" ON "public"."course_settlement_expenses" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_expenses"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id"))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_expenses"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id")))) AND ("created_by" = "auth"."uid"())));


--
-- Name: course_settlement_projects members manage course settlement projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course settlement projects" ON "public"."course_settlement_projects" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: course_settlement_uploads members manage course settlement uploads; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course settlement uploads" ON "public"."course_settlement_uploads" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_uploads"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id"))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_uploads"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id")))) AND ("uploaded_by" = "auth"."uid"())));


--
-- Name: course_settlement_versions members manage course settlement versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course settlement versions" ON "public"."course_settlement_versions" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_versions"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id"))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "course_settlement_versions"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id")))) AND ("calculated_by" = "auth"."uid"())));


--
-- Name: course_wbs members manage course wbs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course wbs" ON "public"."course_wbs" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: course_wbs_people members manage course wbs people; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course wbs people" ON "public"."course_wbs_people" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: course_youtube_appearances members manage course youtube appearances; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage course youtube appearances" ON "public"."course_youtube_appearances" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_youtube_appearances"."course_id") AND "public"."is_workspace_member"("c"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_youtube_appearances"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: courses members manage courses; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage courses" ON "public"."courses" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: message_studio_default_templates members manage message studio default templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage message studio default templates" ON "public"."message_studio_default_templates" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: message_studio_projects members manage message studio projects; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage message studio projects" ON "public"."message_studio_projects" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: message_studio_resources members manage message studio resources; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage message studio resources" ON "public"."message_studio_resources" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."message_studio_projects" "p"
  WHERE (("p"."id" = "message_studio_resources"."project_id") AND "public"."is_workspace_member"("p"."workspace_id"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."message_studio_projects" "p"
  WHERE (("p"."id" = "message_studio_resources"."project_id") AND "public"."is_workspace_member"("p"."workspace_id")))));


--
-- Name: course_settlement_expense_attachments members manage settlement expense attachments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage settlement expense attachments" ON "public"."course_settlement_expense_attachments" TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."course_settlement_expenses" "e"
     JOIN "public"."course_settlement_projects" "p" ON (("p"."id" = "e"."settlement_id")))
  WHERE (("e"."id" = "course_settlement_expense_attachments"."expense_id") AND "public"."is_workspace_member"("p"."workspace_id"))))) WITH CHECK (((EXISTS ( SELECT 1
   FROM ("public"."course_settlement_expenses" "e"
     JOIN "public"."course_settlement_projects" "p" ON (("p"."id" = "e"."settlement_id")))
  WHERE (("e"."id" = "course_settlement_expense_attachments"."expense_id") AND "public"."is_workspace_member"("p"."workspace_id")))) AND ("uploaded_by" = "auth"."uid"())));


--
-- Name: settlement_reports members manage settlement reports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage settlement reports" ON "public"."settlement_reports" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND ("created_by" = "auth"."uid"())));


--
-- Name: students members manage students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage students" ON "public"."students" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: message_template_previews members manage template previews; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage template previews" ON "public"."message_template_previews" TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND (EXISTS ( SELECT 1
   FROM "public"."message_templates" "t"
  WHERE (("t"."id" = "message_template_previews"."template_id") AND (("t"."workspace_id" IS NULL) OR ("t"."workspace_id" = "message_template_previews"."workspace_id")))))));


--
-- Name: message_templates members manage templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members manage templates" ON "public"."message_templates" TO "authenticated" USING ((("workspace_id" IS NULL) OR "public"."is_workspace_member"("workspace_id"))) WITH CHECK ((("workspace_id" IS NOT NULL) AND "public"."is_workspace_member"("workspace_id")));


--
-- Name: address_book_imports members read address imports; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read address imports" ON "public"."address_book_imports" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."address_books" "b"
  WHERE (("b"."id" = "address_book_imports"."address_book_id") AND "public"."is_workspace_member"("b"."workspace_id")))));


--
-- Name: address_book_message_jobs members read address message jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read address message jobs" ON "public"."address_book_message_jobs" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: address_book_message_recipients members read address recipients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read address recipients" ON "public"."address_book_message_recipients" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."address_book_message_jobs" "j"
  WHERE (("j"."id" = "address_book_message_recipients"."message_job_id") AND "public"."is_workspace_member"("j"."workspace_id")))));


--
-- Name: audit_logs members read audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read audit logs" ON "public"."audit_logs" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: course_cost_audit_logs members read course cost audit logs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read course cost audit logs" ON "public"."course_cost_audit_logs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_cost_audit_logs"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_job_notes members read course job notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read course job notes" ON "public"."course_job_notes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "course_job_notes"."course_job_id") AND "public"."is_workspace_member"("j"."workspace_id")))));


--
-- Name: course_notes members read course notes; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read course notes" ON "public"."course_notes" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_notes"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: course_schedule_drafts members read course schedule drafts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read course schedule drafts" ON "public"."course_schedule_drafts" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: course_wbs_templates members read course wbs templates; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read course wbs templates" ON "public"."course_wbs_templates" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: course_webinar_metrics members read course webinar metrics; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read course webinar metrics" ON "public"."course_webinar_metrics" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."courses" "c"
  WHERE (("c"."id" = "course_webinar_metrics"."course_id") AND "public"."is_workspace_member"("c"."workspace_id")))));


--
-- Name: job_enrollments members read enrollments; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read enrollments" ON "public"."job_enrollments" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "job_enrollments"."job_id") AND "public"."is_workspace_member"("j"."workspace_id")))));


--
-- Name: job_file_versions members read file versions; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read file versions" ON "public"."job_file_versions" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_jobs" "j"
  WHERE (("j"."id" = "job_file_versions"."job_id") AND "public"."is_workspace_member"("j"."workspace_id")))));


--
-- Name: import_errors members read import errors; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read import errors" ON "public"."import_errors" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM ("public"."job_file_versions" "v"
     JOIN "public"."course_jobs" "j" ON (("j"."id" = "v"."job_id")))
  WHERE (("v"."id" = "import_errors"."version_id") AND "public"."is_workspace_member"("j"."workspace_id")))));


--
-- Name: course_jobs members read jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read jobs" ON "public"."course_jobs" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: workspace_members members read memberships; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read memberships" ON "public"."workspace_members" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: message_jobs members read message jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read message jobs" ON "public"."message_jobs" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: message_provider_batches members read message provider batches; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read message provider batches" ON "public"."message_provider_batches" FOR SELECT TO "authenticated" USING (((("message_job_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."message_jobs" "job"
  WHERE (("job"."id" = "message_provider_batches"."message_job_id") AND "public"."is_workspace_member"("job"."workspace_id"))))) OR (("address_book_message_job_id" IS NOT NULL) AND (EXISTS ( SELECT 1
   FROM "public"."address_book_message_jobs" "job"
  WHERE (("job"."id" = "message_provider_batches"."address_book_message_job_id") AND "public"."is_workspace_member"("job"."workspace_id")))))));


--
-- Name: message_recipients members read message recipients; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read message recipients" ON "public"."message_recipients" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."message_jobs" "j"
  WHERE (("j"."id" = "message_recipients"."message_job_id") AND "public"."is_workspace_member"("j"."workspace_id")))));


--
-- Name: phone_sales_jobs members read phone sales jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read phone sales jobs" ON "public"."phone_sales_jobs" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: settlement_cost_snapshots members read settlement cost snapshots; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read settlement cost snapshots" ON "public"."settlement_cost_snapshots" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."course_settlement_projects" "p"
  WHERE (("p"."id" = "settlement_cost_snapshots"."settlement_id") AND "public"."is_workspace_member"("p"."workspace_id")))));


--
-- Name: students members read students; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read students" ON "public"."students" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: workspaces members read workspaces; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members read workspaces" ON "public"."workspaces" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("id"));


--
-- Name: course_schedule_drafts members update course schedule drafts; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members update course schedule drafts" ON "public"."course_schedule_drafts" FOR UPDATE TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: phone_sales_jobs members update phone sales jobs; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "members update phone sales jobs" ON "public"."phone_sales_jobs" FOR UPDATE TO "authenticated" USING ("public"."is_workspace_member"("workspace_id")) WITH CHECK ("public"."is_workspace_member"("workspace_id"));


--
-- Name: message_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_provider_batches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_provider_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_recipients; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_recipients" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_studio_default_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_studio_default_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_studio_projects; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_studio_projects" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_studio_resources; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_studio_resources" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_template_previews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_template_previews" ENABLE ROW LEVEL SECURITY;

--
-- Name: message_templates; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."message_templates" ENABLE ROW LEVEL SECURITY;

--
-- Name: hr_annual_leave_grants personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."hr_annual_leave_grants" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."personnel_is_active"("workspace_id"));


--
-- Name: hr_leave_profiles personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."hr_leave_profiles" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."personnel_is_active"("workspace_id"));


--
-- Name: hr_leave_requests personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."hr_leave_requests" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."personnel_is_active"("workspace_id"));


--
-- Name: hr_leave_support_records personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."hr_leave_support_records" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."personnel_is_active"("workspace_id"));


--
-- Name: work_daily_reviews personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."work_daily_reviews" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."personnel_is_active"("workspace_id"));


--
-- Name: work_task_events personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."work_task_events" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_tasks" "t"
  WHERE (("t"."id" = "work_task_events"."task_id") AND "public"."personnel_is_active"("t"."workspace_id")))));


--
-- Name: work_tasks personnel_active_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "personnel_active_read" ON "public"."work_tasks" AS RESTRICTIVE FOR SELECT TO "authenticated" USING ("public"."personnel_is_active"("workspace_id"));


--
-- Name: phone_sales_jobs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."phone_sales_jobs" ENABLE ROW LEVEL SECURITY;

--
-- Name: services; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."services" ENABLE ROW LEVEL SECURITY;

--
-- Name: settlement_cost_snapshots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."settlement_cost_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: settlement_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."settlement_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: students; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."students" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_daily_reports; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_daily_reports" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_daily_reports work_daily_reports_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "work_daily_reports_member_read" ON "public"."work_daily_reports" FOR SELECT TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND "public"."personnel_is_active"("workspace_id")));


--
-- Name: work_daily_reports work_daily_reports_own_insert; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "work_daily_reports_own_insert" ON "public"."work_daily_reports" FOR INSERT TO "authenticated" WITH CHECK (("public"."is_workspace_member"("workspace_id") AND "public"."personnel_is_active"("workspace_id") AND ("user_id" = "auth"."uid"())));


--
-- Name: work_daily_reports work_daily_reports_own_update; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "work_daily_reports_own_update" ON "public"."work_daily_reports" FOR UPDATE TO "authenticated" USING (("public"."is_workspace_member"("workspace_id") AND "public"."personnel_is_active"("workspace_id") AND ("user_id" = "auth"."uid"()))) WITH CHECK (("public"."is_workspace_member"("workspace_id") AND "public"."personnel_is_active"("workspace_id") AND ("user_id" = "auth"."uid"())));


--
-- Name: work_daily_reviews; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_daily_reviews" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_daily_reviews work_daily_reviews_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "work_daily_reviews_member_read" ON "public"."work_daily_reviews" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: work_task_events; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_task_events" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_task_events work_task_events_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "work_task_events_member_read" ON "public"."work_task_events" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."work_tasks" "task"
  WHERE (("task"."id" = "work_task_events"."task_id") AND "public"."is_workspace_member"("task"."workspace_id")))));


--
-- Name: work_tasks; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."work_tasks" ENABLE ROW LEVEL SECURITY;

--
-- Name: work_tasks work_tasks_member_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "work_tasks_member_read" ON "public"."work_tasks" FOR SELECT TO "authenticated" USING ("public"."is_workspace_member"("workspace_id"));


--
-- Name: workspace_members; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspace_members" ENABLE ROW LEVEL SECURITY;

--
-- Name: workspaces; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."workspaces" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_analysis_batches; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_analysis_batches" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_analysis_requests; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_analysis_requests" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_analysis_runs; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_analysis_runs" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_analyzed_channels; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_analyzed_channels" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_analyzed_channels youtube_analyzed_channels_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "youtube_analyzed_channels_read" ON "public"."youtube_analyzed_channels" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "m"
  WHERE (("m"."workspace_id" = "youtube_analyzed_channels"."workspace_id") AND ("m"."user_id" = "auth"."uid"())))));


--
-- Name: youtube_analysis_batches youtube_batches_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "youtube_batches_read" ON "public"."youtube_analysis_batches" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "m"
  WHERE (("m"."workspace_id" = "youtube_analysis_batches"."workspace_id") AND ("m"."user_id" = "auth"."uid"())))));


--
-- Name: youtube_channel_videos; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_channel_videos" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_channel_videos youtube_channel_videos_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "youtube_channel_videos_read" ON "public"."youtube_channel_videos" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."workspace_members" "m"
  WHERE (("m"."workspace_id" = "youtube_channel_videos"."workspace_id") AND ("m"."user_id" = "auth"."uid"())))));


--
-- Name: youtube_analysis_requests youtube_requests_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "youtube_requests_read" ON "public"."youtube_analysis_requests" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."youtube_analysis_batches" "b"
  WHERE ("b"."id" = "youtube_analysis_requests"."batch_id"))));


--
-- Name: youtube_analysis_runs youtube_runs_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "youtube_runs_read" ON "public"."youtube_analysis_runs" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."youtube_analysis_batches" "b"
  WHERE ("b"."id" = "youtube_analysis_runs"."batch_id"))));


--
-- Name: youtube_video_snapshots; Type: ROW SECURITY; Schema: public; Owner: postgres
--

ALTER TABLE "public"."youtube_video_snapshots" ENABLE ROW LEVEL SECURITY;

--
-- Name: youtube_video_snapshots youtube_videos_read; Type: POLICY; Schema: public; Owner: postgres
--

CREATE POLICY "youtube_videos_read" ON "public"."youtube_video_snapshots" FOR SELECT TO "authenticated" USING ((EXISTS ( SELECT 1
   FROM "public"."youtube_analysis_runs" "r"
  WHERE ("r"."id" = "youtube_video_snapshots"."run_id"))));


--
-- Name: SCHEMA "public"; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";


--
-- Name: FUNCTION "admins"("org" "uuid"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."admins"("org" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "assert_version"("actual" integer, "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."assert_version"("actual" integer, "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "at_day"("d" "date", "m" integer); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."at_day"("d" "date", "m" integer) FROM PUBLIC;


--
-- Name: FUNCTION "attendance_command"("e" "hr"."employees", "action" "text", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."attendance_command"("e" "hr"."employees", "action" "text", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "attendance_conflicts"("a" "hr"."attendance", "actor" "uuid"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."attendance_conflicts"("a" "hr"."attendance", "actor" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "attendance_summary"("e" "hr"."employees", "d" "date"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."attendance_summary"("e" "hr"."employees", "d" "date") FROM PUBLIC;


--
-- Name: FUNCTION "can_read"("t" "hr"."tasks", "e" "hr"."employees"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."can_read"("t" "hr"."tasks", "e" "hr"."employees") FROM PUBLIC;


--
-- Name: FUNCTION "correction_command"("e" "hr"."employees", "action" "text", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."correction_command"("e" "hr"."employees", "action" "text", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "deactivate_work_account"("account_id" "uuid"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."deactivate_work_account"("account_id" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "emit"("org" "uuid", "key" "text", "kind" "text", "entity" "uuid", "actor" "uuid", "targets" "uuid"[], "payload" "jsonb", "include_self" boolean); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."emit"("org" "uuid", "key" "text", "kind" "text", "entity" "uuid", "actor" "uuid", "targets" "uuid"[], "payload" "jsonb", "include_self" boolean) FROM PUBLIC;


--
-- Name: FUNCTION "employee_check"("org" "uuid", "ids" "uuid"[]); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."employee_check"("org" "uuid", "ids" "uuid"[]) FROM PUBLIC;


--
-- Name: FUNCTION "employee_command"("e" "hr"."employees", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."employee_command"("e" "hr"."employees", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "fail"("code" "text", "message" "text"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."fail"("code" "text", "message" "text") FROM PUBLIC;


--
-- Name: FUNCTION "guard_employee_dates"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."guard_employee_dates"() FROM PUBLIC;


--
-- Name: FUNCTION "invitation_command"("e" "hr"."employees", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."invitation_command"("e" "hr"."employees", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "leave_command"("e" "hr"."employees", "action" "text", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."leave_command"("e" "hr"."employees", "action" "text", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "leave_expand"("l" "hr"."leaves"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."leave_expand"("l" "hr"."leaves") FROM PUBLIC;


--
-- Name: FUNCTION "leave_preview"("org" "uuid", "start_day" "date", "end_day" "date", "unit" "text"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."leave_preview"("org" "uuid", "start_day" "date", "end_day" "date", "unit" "text") FROM PUBLIC;


--
-- Name: FUNCTION "log"("e" "hr"."employees", "kind" "text", "entity" "uuid", "action" "text", "old_data" "jsonb", "new_data" "jsonb", "reason" "text"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."log"("e" "hr"."employees", "kind" "text", "entity" "uuid", "action" "text", "old_data" "jsonb", "new_data" "jsonb", "reason" "text") FROM PUBLIC;


--
-- Name: FUNCTION "me"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."me"() FROM PUBLIC;


--
-- Name: FUNCTION "on_work_account_created_or_updated"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."on_work_account_created_or_updated"() FROM PUBLIC;


--
-- Name: FUNCTION "on_work_account_deleted"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."on_work_account_deleted"() FROM PUBLIC;


--
-- Name: FUNCTION "only_keys"("p" "jsonb", "keys" "text"[]); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."only_keys"("p" "jsonb", "keys" "text"[]) FROM PUBLIC;


--
-- Name: FUNCTION "person_at"("e" "hr"."employees", "d" "date"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."person_at"("e" "hr"."employees", "d" "date") FROM PUBLIC;


--
-- Name: FUNCTION "personnel_actor"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."personnel_actor"() FROM PUBLIC;


--
-- Name: FUNCTION "policy"("org" "uuid", "d" "date"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."policy"("org" "uuid", "d" "date") FROM PUBLIC;


--
-- Name: FUNCTION "policy_command"("e" "hr"."employees", "action" "text", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."policy_command"("e" "hr"."employees", "action" "text", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "remaining_intervals"("org" "uuid", "employee" "uuid", "d" "date", "policy_override" "uuid"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."remaining_intervals"("org" "uuid", "employee" "uuid", "d" "date", "policy_override" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "review_command"("e" "hr"."employees", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."review_command"("e" "hr"."employees", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "snapshot_attendance"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."snapshot_attendance"() FROM PUBLIC;


--
-- Name: FUNCTION "snapshot_task_event"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."snapshot_task_event"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_all_work_accounts"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."sync_all_work_accounts"() FROM PUBLIC;


--
-- Name: FUNCTION "sync_work_account"("account_id" "uuid"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."sync_work_account"("account_id" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "task_command"("e" "hr"."employees", "action" "text", "p" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."task_command"("e" "hr"."employees", "action" "text", "p" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "task_json"("t" "hr"."tasks"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."task_json"("t" "hr"."tasks") FROM PUBLIC;


--
-- Name: FUNCTION "text_value"("p" "jsonb", "k" "text", "min_len" integer, "max_len" integer); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."text_value"("p" "jsonb", "k" "text", "min_len" integer, "max_len" integer) FROM PUBLIC;


--
-- Name: FUNCTION "today"(); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."today"() FROM PUBLIC;


--
-- Name: FUNCTION "today_tasks"("e" "hr"."employees", "d" "date"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."today_tasks"("e" "hr"."employees", "d" "date") FROM PUBLIC;


--
-- Name: FUNCTION "validate_policy"("c" "jsonb"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."validate_policy"("c" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "work_intervals"("c" "jsonb", "d" "date"); Type: ACL; Schema: hr; Owner: postgres
--

REVOKE ALL ON FUNCTION "hr"."work_intervals"("c" "jsonb", "d" "date") FROM PUBLIC;


--
-- Name: FUNCTION "assert_admin"("w" "uuid", "a" "uuid"); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION "personnel_private"."assert_admin"("w" "uuid", "a" "uuid") FROM PUBLIC;


--
-- Name: FUNCTION "guard_leave"(); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION "personnel_private"."guard_leave"() FROM PUBLIC;


--
-- Name: FUNCTION "guard_task"(); Type: ACL; Schema: personnel_private; Owner: postgres
--

REVOKE ALL ON FUNCTION "personnel_private"."guard_task"() FROM PUBLIC;


--
-- Name: FUNCTION "apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."apply_message_provider_batch_results"("p_batch_id" "uuid", "p_results" "jsonb", "p_checked_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "apply_paid_roster_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_paid_roster_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_paid_roster_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") TO "service_role";


--
-- Name: FUNCTION "apply_paid_roster_review"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."apply_paid_roster_review"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."apply_paid_roster_review"("p_course_id" "uuid", "p_actor_id" "uuid", "p_snapshot" "jsonb", "p_changes" "jsonb") TO "service_role";


--
-- Name: FUNCTION "assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone) TO "anon";
GRANT ALL ON FUNCTION "public"."assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone) TO "authenticated";
GRANT ALL ON FUNCTION "public"."assign_message_provider_batch_recipients"("p_batch_id" "uuid", "p_recipients" "jsonb", "p_requested_at" timestamp with time zone) TO "service_role";


--
-- Name: FUNCTION "check_paid_roster_workspace"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."check_paid_roster_workspace"() TO "anon";
GRANT ALL ON FUNCTION "public"."check_paid_roster_workspace"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."check_paid_roster_workspace"() TO "service_role";


--
-- Name: TABLE "message_provider_batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_provider_batches" TO "anon";
GRANT ALL ON TABLE "public"."message_provider_batches" TO "authenticated";
GRANT ALL ON TABLE "public"."message_provider_batches" TO "service_role";


--
-- Name: FUNCTION "claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."claim_message_provider_batches"("p_job_kind" "text", "p_job_id" "uuid", "p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "create_work_task_with_event"("p_workspace_id" "uuid", "p_title" "text", "p_description" "text", "p_planned_date" "date", "p_creator_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."create_work_task_with_event"("p_workspace_id" "uuid", "p_title" "text", "p_description" "text", "p_planned_date" "date", "p_creator_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."create_work_task_with_event"("p_workspace_id" "uuid", "p_title" "text", "p_description" "text", "p_planned_date" "date", "p_creator_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "edit_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_title" "text", "p_description" "text", "p_is_admin" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."edit_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_title" "text", "p_description" "text", "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."edit_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_title" "text", "p_description" "text", "p_is_admin" boolean) TO "service_role";


--
-- Name: FUNCTION "handle_new_user"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";


--
-- Name: FUNCTION "hr_bootstrap"("p_auth_id" "uuid", "p_name" "text", "p_start_date" "date", "p_organization_name" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_bootstrap"("p_auth_id" "uuid", "p_name" "text", "p_start_date" "date", "p_organization_name" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_bootstrap"("p_auth_id" "uuid", "p_name" "text", "p_start_date" "date", "p_organization_name" "text") TO "service_role";


--
-- Name: FUNCTION "hr_claim_invitation"("p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_claim_invitation"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_claim_invitation"("p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "hr_command"("p_action" "text", "p_body" "jsonb", "p_key" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_command"("p_action" "text", "p_body" "jsonb", "p_key" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_command"("p_action" "text", "p_body" "jsonb", "p_key" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hr_command"("p_action" "text", "p_body" "jsonb", "p_key" "uuid") TO "service_role";


--
-- Name: FUNCTION "hr_finish_invitation"("p_id" "uuid", "p_auth_id" "uuid", "p_success" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_finish_invitation"("p_id" "uuid", "p_auth_id" "uuid", "p_success" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_finish_invitation"("p_id" "uuid", "p_auth_id" "uuid", "p_success" boolean) TO "service_role";


--
-- Name: FUNCTION "hr_generate_reminders"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_generate_reminders"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_generate_reminders"() TO "service_role";


--
-- Name: FUNCTION "hr_personnel_query"("p_id" "uuid", "p_page" integer, "p_status" "text", "p_q" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_personnel_query"("p_id" "uuid", "p_page" integer, "p_status" "text", "p_q" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_personnel_query"("p_id" "uuid", "p_page" integer, "p_status" "text", "p_q" "text") TO "authenticated";


--
-- Name: FUNCTION "hr_personnel_save"("p" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_personnel_save"("p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_personnel_save"("p" "jsonb") TO "authenticated";


--
-- Name: FUNCTION "hr_process_notifications"("p_limit" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_process_notifications"("p_limit" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_process_notifications"("p_limit" integer) TO "service_role";


--
-- Name: FUNCTION "hr_query"("p_resource" "text", "p_filter" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_query"("p_resource" "text", "p_filter" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_query"("p_resource" "text", "p_filter" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."hr_query"("p_resource" "text", "p_filter" "jsonb") TO "service_role";


--
-- Name: FUNCTION "hr_reconcile_invitation"("p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."hr_reconcile_invitation"("p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."hr_reconcile_invitation"("p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "import_course_orders"("p_course_id" "uuid", "p_actor_id" "uuid", "p_file_name" "text", "p_rows" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."import_course_orders"("p_course_id" "uuid", "p_actor_id" "uuid", "p_file_name" "text", "p_rows" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_course_orders"("p_course_id" "uuid", "p_actor_id" "uuid", "p_file_name" "text", "p_rows" "jsonb") TO "service_role";


--
-- Name: FUNCTION "is_workspace_member"("target_workspace" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_workspace_member"("target_workspace" "uuid") TO "service_role";


--
-- Name: FUNCTION "paid_roster_snapshot"("p_course_id" "uuid", "p_actor_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."paid_roster_snapshot"("p_course_id" "uuid", "p_actor_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."paid_roster_snapshot"("p_course_id" "uuid", "p_actor_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "personnel_access"("p_workspace_id" "uuid", "p_user_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."personnel_access"("p_workspace_id" "uuid", "p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personnel_access"("p_workspace_id" "uuid", "p_user_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "personnel_directory"("p_workspace_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."personnel_directory"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personnel_directory"("p_workspace_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "personnel_is_active"("p_workspace_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."personnel_is_active"("p_workspace_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personnel_is_active"("p_workspace_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."personnel_is_active"("p_workspace_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "personnel_query"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid", "p_page" integer, "p_q" "text", "p_status" "text"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."personnel_query"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid", "p_page" integer, "p_q" "text", "p_status" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personnel_query"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid", "p_page" integer, "p_q" "text", "p_status" "text") TO "service_role";


--
-- Name: FUNCTION "personnel_reveal"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."personnel_reveal"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personnel_reveal"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_id" "uuid") TO "service_role";


--
-- Name: FUNCTION "personnel_save"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."personnel_save"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."personnel_save"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p" "jsonb") TO "service_role";


--
-- Name: FUNCTION "reset_hr_leave_year"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_year" integer, "p_is_admin" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."reset_hr_leave_year"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_year" integer, "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."reset_hr_leave_year"("p_workspace_id" "uuid", "p_actor_id" "uuid", "p_year" integer, "p_is_admin" boolean) TO "service_role";


--
-- Name: FUNCTION "save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_course_cost_changes"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") TO "service_role";


--
-- Name: FUNCTION "save_course_cost_changes_and_reset_settlement"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_course_cost_changes_and_reset_settlement"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_course_cost_changes_and_reset_settlement"("p_course_id" "uuid", "p_actor_id" "uuid", "p_changes" "jsonb") TO "service_role";


--
-- Name: FUNCTION "save_course_paid_roster"("p_course_id" "uuid", "p_actor_id" "uuid", "p_order_ids" "uuid"[]); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_course_paid_roster"("p_course_id" "uuid", "p_actor_id" "uuid", "p_order_ids" "uuid"[]) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_course_paid_roster"("p_course_id" "uuid", "p_actor_id" "uuid", "p_order_ids" "uuid"[]) TO "service_role";


--
-- Name: FUNCTION "save_course_webinar_metrics"("p_course_id" "uuid", "p_metrics" "jsonb", "p_expected_version" integer); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_course_webinar_metrics"("p_course_id" "uuid", "p_metrics" "jsonb", "p_expected_version" integer) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_course_webinar_metrics"("p_course_id" "uuid", "p_metrics" "jsonb", "p_expected_version" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."save_course_webinar_metrics"("p_course_id" "uuid", "p_metrics" "jsonb", "p_expected_version" integer) TO "service_role";


--
-- Name: FUNCTION "save_youtube_analysis"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_youtube_analysis"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") FROM PUBLIC;


--
-- Name: FUNCTION "save_youtube_channel"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."save_youtube_channel"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_youtube_channel"("p_batch" "uuid", "p_channel" "jsonb", "p_metrics" "jsonb", "p_warnings" "jsonb", "p_started" timestamp with time zone, "p_videos" "jsonb") TO "service_role";


--
-- Name: FUNCTION "set_user_account_role"("target_user_id" "uuid", "target_role" "public"."app_role"); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_user_account_role"("target_user_id" "uuid", "target_role" "public"."app_role") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_user_account_role"("target_user_id" "uuid", "target_role" "public"."app_role") TO "service_role";


--
-- Name: FUNCTION "set_work_task_status_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_status" "text", "p_is_admin" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."set_work_task_status_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_status" "text", "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_work_task_status_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_status" "text", "p_is_admin" boolean) TO "service_role";


--
-- Name: FUNCTION "touch_course_schedule_draft_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_course_schedule_draft_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_course_schedule_draft_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_course_schedule_draft_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_course_wbs_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."touch_course_wbs_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."touch_course_wbs_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."touch_course_wbs_updated_at"() TO "service_role";


--
-- Name: FUNCTION "touch_hr_leave_updated_at"(); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."touch_hr_leave_updated_at"() FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."touch_hr_leave_updated_at"() TO "service_role";


--
-- Name: FUNCTION "transfer_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_is_admin" boolean); Type: ACL; Schema: public; Owner: postgres
--

REVOKE ALL ON FUNCTION "public"."transfer_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_is_admin" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."transfer_work_task_with_event"("p_task_id" "uuid", "p_workspace_id" "uuid", "p_actor_id" "uuid", "p_assignee_id" "uuid", "p_note" "text", "p_is_admin" boolean) TO "service_role";


--
-- Name: FUNCTION "youtube_snapshot_immutable"(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION "public"."youtube_snapshot_immutable"() TO "anon";
GRANT ALL ON FUNCTION "public"."youtube_snapshot_immutable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."youtube_snapshot_immutable"() TO "service_role";


--
-- Name: TABLE "ad_performance_daily_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_daily_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_daily_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_daily_metrics" TO "service_role";


--
-- Name: TABLE "ad_performance_dashboard_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_dashboard_metrics" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_dashboard_metrics" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_dashboard_metrics" TO "service_role";


--
-- Name: TABLE "ad_performance_dashboards"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_dashboards" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_dashboards" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_dashboards" TO "service_role";


--
-- Name: TABLE "ad_performance_organic_metric_values"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_organic_metric_values" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_organic_metric_values" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_organic_metric_values" TO "service_role";


--
-- Name: TABLE "ad_performance_dashboard_summaries"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_dashboard_summaries" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_dashboard_summaries" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_dashboard_summaries" TO "service_role";


--
-- Name: TABLE "ad_performance_organic_channels"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_organic_channels" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_organic_channels" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_organic_channels" TO "service_role";


--
-- Name: TABLE "ad_performance_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."ad_performance_settings" TO "anon";
GRANT ALL ON TABLE "public"."ad_performance_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."ad_performance_settings" TO "service_role";


--
-- Name: TABLE "address_book_contacts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."address_book_contacts" TO "anon";
GRANT ALL ON TABLE "public"."address_book_contacts" TO "authenticated";
GRANT ALL ON TABLE "public"."address_book_contacts" TO "service_role";


--
-- Name: TABLE "address_book_imports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."address_book_imports" TO "anon";
GRANT ALL ON TABLE "public"."address_book_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."address_book_imports" TO "service_role";


--
-- Name: TABLE "address_book_message_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."address_book_message_jobs" TO "anon";
GRANT ALL ON TABLE "public"."address_book_message_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."address_book_message_jobs" TO "service_role";


--
-- Name: TABLE "address_book_message_recipients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."address_book_message_recipients" TO "anon";
GRANT ALL ON TABLE "public"."address_book_message_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."address_book_message_recipients" TO "service_role";


--
-- Name: TABLE "address_books"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."address_books" TO "anon";
GRANT ALL ON TABLE "public"."address_books" TO "authenticated";
GRANT ALL ON TABLE "public"."address_books" TO "service_role";


--
-- Name: TABLE "audit_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_logs" TO "service_role";


--
-- Name: SEQUENCE "audit_logs_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."audit_logs_id_seq" TO "service_role";


--
-- Name: TABLE "cash_flow_course_plans"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cash_flow_course_plans" TO "anon";
GRANT ALL ON TABLE "public"."cash_flow_course_plans" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_flow_course_plans" TO "service_role";


--
-- Name: TABLE "cash_flow_settings"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."cash_flow_settings" TO "anon";
GRANT ALL ON TABLE "public"."cash_flow_settings" TO "authenticated";
GRANT ALL ON TABLE "public"."cash_flow_settings" TO "service_role";


--
-- Name: TABLE "course_cost_attachments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_cost_attachments" TO "anon";
GRANT ALL ON TABLE "public"."course_cost_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_cost_attachments" TO "service_role";


--
-- Name: TABLE "course_cost_audit_logs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_cost_audit_logs" TO "anon";
GRANT ALL ON TABLE "public"."course_cost_audit_logs" TO "authenticated";
GRANT ALL ON TABLE "public"."course_cost_audit_logs" TO "service_role";


--
-- Name: SEQUENCE "course_cost_audit_logs_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."course_cost_audit_logs_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."course_cost_audit_logs_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."course_cost_audit_logs_id_seq" TO "service_role";


--
-- Name: TABLE "course_costs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_costs" TO "anon";
GRANT ALL ON TABLE "public"."course_costs" TO "authenticated";
GRANT ALL ON TABLE "public"."course_costs" TO "service_role";


--
-- Name: TABLE "course_instagram_materials"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_instagram_materials" TO "anon";
GRANT ALL ON TABLE "public"."course_instagram_materials" TO "authenticated";
GRANT ALL ON TABLE "public"."course_instagram_materials" TO "service_role";


--
-- Name: TABLE "course_instagram_shares"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_instagram_shares" TO "anon";
GRANT ALL ON TABLE "public"."course_instagram_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."course_instagram_shares" TO "service_role";


--
-- Name: TABLE "course_job_invites"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_job_invites" TO "anon";
GRANT ALL ON TABLE "public"."course_job_invites" TO "authenticated";
GRANT ALL ON TABLE "public"."course_job_invites" TO "service_role";


--
-- Name: TABLE "course_job_notes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_job_notes" TO "anon";
GRANT ALL ON TABLE "public"."course_job_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."course_job_notes" TO "service_role";


--
-- Name: TABLE "course_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_jobs" TO "anon";
GRANT ALL ON TABLE "public"."course_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."course_jobs" TO "service_role";


--
-- Name: TABLE "course_live_videos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_live_videos" TO "anon";
GRANT ALL ON TABLE "public"."course_live_videos" TO "authenticated";
GRANT ALL ON TABLE "public"."course_live_videos" TO "service_role";


--
-- Name: TABLE "course_notes"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_notes" TO "anon";
GRANT ALL ON TABLE "public"."course_notes" TO "authenticated";
GRANT ALL ON TABLE "public"."course_notes" TO "service_role";


--
-- Name: TABLE "course_options"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_options" TO "anon";
GRANT ALL ON TABLE "public"."course_options" TO "authenticated";
GRANT ALL ON TABLE "public"."course_options" TO "service_role";


--
-- Name: TABLE "course_order_imports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_order_imports" TO "anon";
GRANT ALL ON TABLE "public"."course_order_imports" TO "authenticated";
GRANT ALL ON TABLE "public"."course_order_imports" TO "service_role";


--
-- Name: TABLE "course_orders"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_orders" TO "anon";
GRANT ALL ON TABLE "public"."course_orders" TO "authenticated";
GRANT ALL ON TABLE "public"."course_orders" TO "service_role";


--
-- Name: TABLE "course_schedule_drafts"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_schedule_drafts" TO "anon";
GRANT ALL ON TABLE "public"."course_schedule_drafts" TO "authenticated";
GRANT ALL ON TABLE "public"."course_schedule_drafts" TO "service_role";


--
-- Name: TABLE "course_settlement_draft_attachments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_settlement_draft_attachments" TO "anon";
GRANT ALL ON TABLE "public"."course_settlement_draft_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_settlement_draft_attachments" TO "service_role";


--
-- Name: TABLE "course_settlement_expense_attachments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_settlement_expense_attachments" TO "anon";
GRANT ALL ON TABLE "public"."course_settlement_expense_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."course_settlement_expense_attachments" TO "service_role";


--
-- Name: TABLE "course_settlement_expenses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_settlement_expenses" TO "anon";
GRANT ALL ON TABLE "public"."course_settlement_expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."course_settlement_expenses" TO "service_role";


--
-- Name: TABLE "course_settlement_projects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_settlement_projects" TO "anon";
GRANT ALL ON TABLE "public"."course_settlement_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."course_settlement_projects" TO "service_role";


--
-- Name: TABLE "course_settlement_uploads"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_settlement_uploads" TO "anon";
GRANT ALL ON TABLE "public"."course_settlement_uploads" TO "authenticated";
GRANT ALL ON TABLE "public"."course_settlement_uploads" TO "service_role";


--
-- Name: TABLE "course_settlement_versions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_settlement_versions" TO "anon";
GRANT ALL ON TABLE "public"."course_settlement_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."course_settlement_versions" TO "service_role";


--
-- Name: TABLE "course_wbs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_wbs" TO "anon";
GRANT ALL ON TABLE "public"."course_wbs" TO "authenticated";
GRANT ALL ON TABLE "public"."course_wbs" TO "service_role";


--
-- Name: TABLE "course_wbs_people"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_wbs_people" TO "anon";
GRANT ALL ON TABLE "public"."course_wbs_people" TO "authenticated";
GRANT ALL ON TABLE "public"."course_wbs_people" TO "service_role";


--
-- Name: TABLE "course_wbs_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_wbs_templates" TO "anon";
GRANT SELECT,REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLE "public"."course_wbs_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."course_wbs_templates" TO "service_role";


--
-- Name: TABLE "course_webinar_metrics"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_webinar_metrics" TO "service_role";
GRANT SELECT ON TABLE "public"."course_webinar_metrics" TO "authenticated";


--
-- Name: TABLE "course_youtube_appearances"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."course_youtube_appearances" TO "anon";
GRANT ALL ON TABLE "public"."course_youtube_appearances" TO "authenticated";
GRANT ALL ON TABLE "public"."course_youtube_appearances" TO "service_role";


--
-- Name: TABLE "courses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."courses" TO "anon";
GRANT ALL ON TABLE "public"."courses" TO "authenticated";
GRANT ALL ON TABLE "public"."courses" TO "service_role";


--
-- Name: TABLE "hr_annual_leave_grants"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hr_annual_leave_grants" TO "anon";
GRANT ALL ON TABLE "public"."hr_annual_leave_grants" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_annual_leave_grants" TO "service_role";


--
-- Name: TABLE "hr_leave_profiles"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hr_leave_profiles" TO "anon";
GRANT ALL ON TABLE "public"."hr_leave_profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_leave_profiles" TO "service_role";


--
-- Name: TABLE "hr_leave_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hr_leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."hr_leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_leave_requests" TO "service_role";


--
-- Name: TABLE "hr_leave_support_records"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."hr_leave_support_records" TO "anon";
GRANT ALL ON TABLE "public"."hr_leave_support_records" TO "authenticated";
GRANT ALL ON TABLE "public"."hr_leave_support_records" TO "service_role";


--
-- Name: TABLE "import_errors"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."import_errors" TO "anon";
GRANT ALL ON TABLE "public"."import_errors" TO "authenticated";
GRANT ALL ON TABLE "public"."import_errors" TO "service_role";


--
-- Name: TABLE "job_enrollments"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."job_enrollments" TO "anon";
GRANT ALL ON TABLE "public"."job_enrollments" TO "authenticated";
GRANT ALL ON TABLE "public"."job_enrollments" TO "service_role";


--
-- Name: TABLE "job_file_versions"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."job_file_versions" TO "anon";
GRANT ALL ON TABLE "public"."job_file_versions" TO "authenticated";
GRANT ALL ON TABLE "public"."job_file_versions" TO "service_role";


--
-- Name: TABLE "message_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_jobs" TO "anon";
GRANT ALL ON TABLE "public"."message_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."message_jobs" TO "service_role";


--
-- Name: TABLE "message_recipients"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_recipients" TO "anon";
GRANT ALL ON TABLE "public"."message_recipients" TO "authenticated";
GRANT ALL ON TABLE "public"."message_recipients" TO "service_role";


--
-- Name: TABLE "message_studio_default_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_studio_default_templates" TO "anon";
GRANT ALL ON TABLE "public"."message_studio_default_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_studio_default_templates" TO "service_role";


--
-- Name: TABLE "message_studio_projects"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_studio_projects" TO "anon";
GRANT ALL ON TABLE "public"."message_studio_projects" TO "authenticated";
GRANT ALL ON TABLE "public"."message_studio_projects" TO "service_role";


--
-- Name: TABLE "message_studio_resources"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_studio_resources" TO "anon";
GRANT ALL ON TABLE "public"."message_studio_resources" TO "authenticated";
GRANT ALL ON TABLE "public"."message_studio_resources" TO "service_role";


--
-- Name: TABLE "message_template_previews"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_template_previews" TO "anon";
GRANT ALL ON TABLE "public"."message_template_previews" TO "authenticated";
GRANT ALL ON TABLE "public"."message_template_previews" TO "service_role";


--
-- Name: TABLE "message_templates"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."message_templates" TO "anon";
GRANT ALL ON TABLE "public"."message_templates" TO "authenticated";
GRANT ALL ON TABLE "public"."message_templates" TO "service_role";


--
-- Name: TABLE "phone_sales_jobs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."phone_sales_jobs" TO "anon";
GRANT ALL ON TABLE "public"."phone_sales_jobs" TO "authenticated";
GRANT ALL ON TABLE "public"."phone_sales_jobs" TO "service_role";


--
-- Name: TABLE "services"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."services" TO "anon";
GRANT ALL ON TABLE "public"."services" TO "authenticated";
GRANT ALL ON TABLE "public"."services" TO "service_role";


--
-- Name: TABLE "settlement_cost_snapshots"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."settlement_cost_snapshots" TO "anon";
GRANT ALL ON TABLE "public"."settlement_cost_snapshots" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_cost_snapshots" TO "service_role";


--
-- Name: TABLE "settlement_reports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."settlement_reports" TO "anon";
GRANT ALL ON TABLE "public"."settlement_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."settlement_reports" TO "service_role";


--
-- Name: TABLE "students"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."students" TO "anon";
GRANT ALL ON TABLE "public"."students" TO "authenticated";
GRANT ALL ON TABLE "public"."students" TO "service_role";


--
-- Name: TABLE "work_daily_reports"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."work_daily_reports" TO "anon";
GRANT ALL ON TABLE "public"."work_daily_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."work_daily_reports" TO "service_role";


--
-- Name: TABLE "work_daily_reviews"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."work_daily_reviews" TO "anon";
GRANT ALL ON TABLE "public"."work_daily_reviews" TO "authenticated";
GRANT ALL ON TABLE "public"."work_daily_reviews" TO "service_role";


--
-- Name: TABLE "work_task_events"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."work_task_events" TO "anon";
GRANT ALL ON TABLE "public"."work_task_events" TO "authenticated";
GRANT ALL ON TABLE "public"."work_task_events" TO "service_role";


--
-- Name: SEQUENCE "work_task_events_id_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."work_task_events_id_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."work_task_events_id_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."work_task_events_id_seq" TO "service_role";


--
-- Name: TABLE "work_tasks"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."work_tasks" TO "anon";
GRANT ALL ON TABLE "public"."work_tasks" TO "authenticated";
GRANT ALL ON TABLE "public"."work_tasks" TO "service_role";


--
-- Name: TABLE "workspace_members"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspace_members" TO "anon";
GRANT ALL ON TABLE "public"."workspace_members" TO "authenticated";
GRANT ALL ON TABLE "public"."workspace_members" TO "service_role";


--
-- Name: TABLE "workspaces"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."workspaces" TO "anon";
GRANT ALL ON TABLE "public"."workspaces" TO "authenticated";
GRANT ALL ON TABLE "public"."workspaces" TO "service_role";


--
-- Name: TABLE "youtube_analysis_batches"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_analysis_batches" TO "service_role";
GRANT SELECT ON TABLE "public"."youtube_analysis_batches" TO "authenticated";


--
-- Name: TABLE "youtube_analysis_requests"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_analysis_requests" TO "service_role";
GRANT SELECT ON TABLE "public"."youtube_analysis_requests" TO "authenticated";


--
-- Name: TABLE "youtube_analysis_runs"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_analysis_runs" TO "service_role";
GRANT SELECT ON TABLE "public"."youtube_analysis_runs" TO "authenticated";


--
-- Name: TABLE "youtube_analyzed_channels"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_analyzed_channels" TO "service_role";
GRANT SELECT ON TABLE "public"."youtube_analyzed_channels" TO "authenticated";


--
-- Name: SEQUENCE "youtube_analyzed_channels_position_seq"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE "public"."youtube_analyzed_channels_position_seq" TO "anon";
GRANT ALL ON SEQUENCE "public"."youtube_analyzed_channels_position_seq" TO "authenticated";
GRANT ALL ON SEQUENCE "public"."youtube_analyzed_channels_position_seq" TO "service_role";


--
-- Name: TABLE "youtube_channel_videos"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_channel_videos" TO "service_role";
GRANT SELECT ON TABLE "public"."youtube_channel_videos" TO "authenticated";


--
-- Name: TABLE "youtube_latest_analyses"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_latest_analyses" TO "anon";
GRANT ALL ON TABLE "public"."youtube_latest_analyses" TO "authenticated";
GRANT ALL ON TABLE "public"."youtube_latest_analyses" TO "service_role";


--
-- Name: TABLE "youtube_video_snapshots"; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON TABLE "public"."youtube_video_snapshots" TO "service_role";
GRANT SELECT ON TABLE "public"."youtube_video_snapshots" TO "authenticated";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: supabase_admin
--

-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
-- Platform-owned default privileges already provided by Supabase: ALTER DEFAULT PRIVILEGES FOR ROLE "supabase_admin" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";


--
-- PostgreSQL database dump complete
--



-- App customizations on Supabase-managed schemas.
SET search_path = public, pg_catalog;
CREATE TRIGGER hr_work_account_created_or_updated AFTER INSERT OR UPDATE ON auth.users FOR EACH ROW EXECUTE FUNCTION hr.on_work_account_created_or_updated();
CREATE TRIGGER hr_work_account_deleted BEFORE DELETE ON auth.users FOR EACH ROW EXECUTE FUNCTION hr.on_work_account_deleted();
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();
CREATE POLICY "members delete course banners" ON "storage"."objects" AS PERMISSIVE FOR DELETE TO "authenticated" USING (((bucket_id = 'course-banners'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members read course banners" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'course-banners'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members read course cost evidence" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'course-cost-evidence'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members read course files" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'course-files'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members read course settlement files" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'course-settlement-files'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members read settlement evidence" ON "storage"."objects" AS PERMISSIVE FOR SELECT TO "authenticated" USING (((bucket_id = 'settlement-evidence'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members update course banners" ON "storage"."objects" AS PERMISSIVE FOR UPDATE TO "authenticated" USING (((bucket_id = 'course-banners'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid))) WITH CHECK (((bucket_id = 'course-banners'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members upload course banners" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'course-banners'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members upload course cost evidence" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'course-cost-evidence'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members upload course files" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'course-files'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));
CREATE POLICY "members upload settlement evidence" ON "storage"."objects" AS PERMISSIVE FOR INSERT TO "authenticated" WITH CHECK (((bucket_id = 'settlement-evidence'::text) AND is_workspace_member(((storage.foldername(name))[1])::uuid)));

-- Global configuration only. Not a backup of application records.
INSERT INTO storage.buckets ("id", "name", "public", "file_size_limit", "allowed_mime_types")
SELECT "id", "name", "public", "file_size_limit", "allowed_mime_types" FROM jsonb_populate_recordset(NULL::storage.buckets, '[{"id":"admin-settings","name":"admin-settings","public":false,"file_size_limit":262144,"allowed_mime_types":["application/json"]},{"id":"course-banners","name":"course-banners","public":false,"file_size_limit":8388608,"allowed_mime_types":["image/jpeg","image/png","image/webp"]},{"id":"course-cost-evidence","name":"course-cost-evidence","public":false,"file_size_limit":20971520,"allowed_mime_types":["application/pdf","image/jpeg","image/png","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]},{"id":"course-files","name":"course-files","public":false,"file_size_limit":20971520,"allowed_mime_types":["text/csv","application/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]},{"id":"course-settlement-files","name":"course-settlement-files","public":false,"file_size_limit":26214400,"allowed_mime_types":["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]},{"id":"settlement-evidence","name":"settlement-evidence","public":false,"file_size_limit":20971520,"allowed_mime_types":["application/pdf","image/jpeg","image/png"]}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.services ("id", "service_key", "title", "description", "icon", "route", "status", "display_order", "allowed_roles")
SELECT "id", "service_key", "title", "description", "icon", "route", "status", "display_order", "allowed_roles" FROM jsonb_populate_recordset(NULL::public.services, '[{"id":"9f698bab-3e81-439b-8395-0aec19875ebc","service_key":"cash-flow","title":"자금 흐름","description":"현재 통장 잔액과 강의별 입출금, 월 고정지출을 반영해 향후 자금 잔액을 예측합니다.","icon":"wallet-cards","route":"/services/cash-flow","status":"active","display_order":6,"allowed_roles":["super_admin","admin","user"]},{"id":"cba490cb-66f0-42bb-b476-ffd459c32b2a","service_key":"course-operations","title":"강의 운영 자동화","description":"강의를 기준으로 일정, 옵션, 수강생 명단, 문자 제작물과 유튜브 출연 정보를 연결합니다.","icon":"book-open-check","route":"/services/course-operations","status":"active","display_order":5,"allowed_roles":["super_admin","admin","user"]},{"id":"05ada2d7-ef3e-41ce-9153-b7678a8fb8fa","service_key":"course-roster","title":"수강생 명단 분석","description":"신청자 명단 분류·분석·발송·다운로드","icon":"users","route":"/services/course-roster","status":"active","display_order":10,"allowed_roles":["super_admin","admin","user"]},{"id":"bb494bd5-23ef-4aca-bd4b-79acf6a1ed54","service_key":"message-automation","title":"알림톡·문자 자동화","description":"주소록을 만들고 Shoong 템플릿으로 메시지를 발송합니다.","icon":"message-square","route":"/services/message-automation","status":"active","display_order":20,"allowed_roles":["super_admin","admin","user"]},{"id":"de864963-e041-4bcb-a859-20abcbdf5024","service_key":"message-studio","title":"문자 생성·제작 프로그램","description":"30개의 예시 문자를 바탕으로 강의별 신규 문자 30개를 AI로 제작합니다.","icon":"sparkles","route":"/services/message-studio","status":"active","display_order":30,"allowed_roles":["super_admin","admin","user"]},{"id":"8bc5f324-337a-4b5d-9d45-0fe4ef197420","service_key":"phone-sales-list","title":"전화세일즈 명단 만들기","description":"무료강의 신청자에서 유료강의 신청자를 제외해 전화 세일즈 명단을 만듭니다.","icon":"phone-call","route":"/services/phone-sales-list","status":"active","display_order":35,"allowed_roles":["super_admin","admin","user"]},{"id":"c33d04a0-a9da-45e1-898b-564000a4c8b8","service_key":"settlement-analysis","title":"매출정산 정보확인","description":"정산 엑셀을 강사·강의·결제수단별로 분석하고 중복 구매자와 매출 추이를 확인합니다.","icon":"hand-coins","route":"/services/settlement-analysis","status":"active","display_order":40,"allowed_roles":["super_admin","admin","user"]}]'::jsonb)
ON CONFLICT (service_key) DO NOTHING;

INSERT INTO public.message_templates ("id", "workspace_id", "name", "template_code", "applicant_variable", "course_variable", "is_system", "variable_names", "preview_config", "send_type")
SELECT "id", "workspace_id", "name", "template_code", "applicant_variable", "course_variable", "is_system", "variable_names", "preview_config", "send_type" FROM jsonb_populate_recordset(NULL::public.message_templates, '[{"id":"dedicated_entry_link_guide_2","workspace_id":null,"name":"무료 강의 입장 안내 2","template_code":"dedicated_entry_link_guide_2","applicant_variable":"신청자","course_variable":"강좌명","is_system":true,"variable_names":["신청자","강좌명","링크"],"preview_config":{},"send_type":"at"}]'::jsonb)
ON CONFLICT (id) DO NOTHING;

-- Supabase provides pg_cron; enable it only when not already available.
DO $cron_extension$ BEGIN
  IF to_regprocedure('cron.schedule(text,text,text)') IS NULL THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
  END IF;
END $cron_extension$;
SELECT cron.schedule('bizup-hr-notifications', '* * * * *', 'select public.hr_generate_reminders(); select public.hr_process_notifications(500);');
SET search_path = public, extensions;
SET row_security = on;
SET check_function_bodies = on;
