-- WORK 사용자 관리(loadAdminUsers)의 기존 auth.users 계정을 HR 직원으로 추가합니다.
-- Supabase SQL Editor에서 postgres 역할로 파일 전체를 실행하세요.
-- 새 로그인 계정이나 초대 메일을 만들지 않습니다. 재실행해도 중복 추가하지 않습니다.
-- 기존 HR 직원의 이름·부서·역할·재직 상태는 유지합니다.
BEGIN;

CREATE TEMP TABLE hr_work_account_import_result (
  email text,
  result text NOT NULL,
  detail text NOT NULL
) ON COMMIT DROP;

DO $import_work_accounts$
DECLARE
  actor hr.employees;
  account auth.users;
  existing hr.employees;
  added hr.employees;
  address text;
  display_name text;
  department_name text;
  account_data jsonb;
  metadata jsonb;
  enabled boolean;
BEGIN
  SELECT * INTO actor FROM hr.employees
    WHERE email='resumet@gmail.com' AND role='admin' AND active;
  IF actor.id IS NULL THEN
    RAISE EXCEPTION '초기 HR 관리자 resumet@gmail.com의 연결 상태를 먼저 확인해 주세요.';
  END IF;
  -- Same organization lock as normal HR commands: serializes imports and HR edits.
  PERFORM 1 FROM hr.organizations WHERE id=actor.organization_id FOR UPDATE;
  SELECT * INTO actor FROM hr.employees WHERE id=actor.id AND role='admin' AND active;
  IF actor.id IS NULL THEN RAISE EXCEPTION 'HR 관리자 권한이 변경되었습니다.'; END IF;

  FOR account IN SELECT * FROM auth.users ORDER BY id LOOP
    account_data:=to_jsonb(account);
    address:=lower(btrim(account.email));
    IF address IS NULL OR address='' OR account_data->>'deleted_at' IS NOT NULL THEN
      INSERT INTO hr_work_account_import_result VALUES(address,'제외','이메일 없음 또는 삭제된 인증 계정');
      CONTINUE;
    END IF;

    SELECT * INTO existing FROM hr.employees WHERE auth_id=account.id;
    IF existing.id IS NOT NULL THEN
      INSERT INTO hr_work_account_import_result VALUES(address,'유지',
        CASE WHEN existing.organization_id=actor.organization_id THEN '이미 HR에 등록됨' ELSE '다른 HR 조직에 연결되어 있음' END);
      CONTINUE;
    END IF;

    SELECT * INTO existing FROM hr.employees
      WHERE organization_id=actor.organization_id AND email=address;
    IF existing.id IS NOT NULL THEN
      -- Do not let an imported account take over another employee or an HR administrator.
      INSERT INTO hr_work_account_import_result VALUES(address,'확인 필요','같은 이메일의 HR 기록이 있어 자동 연결을 생략함');
      CONTINUE;
    END IF;

    metadata:=coalesce(account_data->'raw_user_meta_data','{}'::jsonb);
    SELECT value INTO display_name FROM (VALUES
      (1,CASE WHEN jsonb_typeof(metadata->'full_name')='string' THEN nullif(btrim(metadata->>'full_name'),'') END),
      (2,CASE WHEN jsonb_typeof(metadata->'name')='string' THEN nullif(btrim(metadata->>'name'),'') END),
      (3,CASE WHEN jsonb_typeof(metadata->'user_name')='string' THEN nullif(btrim(metadata->>'user_name'),'') END),
      (4,coalesce(nullif(split_part(address,'@',1),''),address))
    ) names(priority,value) WHERE value IS NOT NULL ORDER BY priority LIMIT 1;
    department_name:=CASE WHEN jsonb_typeof(metadata->'department')='string' THEN btrim(metadata->>'department') ELSE '' END;
    enabled:=coalesce((account_data->>'banned_until')::timestamptz<=now(),true);

    INSERT INTO hr.employees(organization_id,auth_id,email,name,department,role,active,employment_start_date,deactivated_at)
      VALUES(actor.organization_id,account.id,address,left(display_name,100),left(department_name,100),'employee',enabled,hr.today(),
        CASE WHEN NOT enabled THEN now() END)
      RETURNING * INTO added;
    PERFORM hr.log(actor,'employee',added.id,'employee.imported_from_work',NULL,to_jsonb(added),'WORK 기존 로그인 계정에서 HR 직원으로 추가');
    INSERT INTO hr_work_account_import_result VALUES(address,'추가',
      CASE WHEN enabled THEN '기존 로그인 계정 연결 · 직원 권한' ELSE '로그인 제한 계정 · 비활성 직원으로 추가' END);
  END LOOP;
END $import_work_accounts$;

-- 결과는 이번 실행에만 표시됩니다. 등록일을 입사일 기본값으로 사용하며 HR에서 수정할 수 있습니다.
SELECT result AS "처리 결과",count(*) AS "계정 수" FROM hr_work_account_import_result GROUP BY result ORDER BY result;
SELECT email AS "이메일",result AS "처리 결과",detail AS "내용" FROM hr_work_account_import_result ORDER BY result,email;
COMMIT;
