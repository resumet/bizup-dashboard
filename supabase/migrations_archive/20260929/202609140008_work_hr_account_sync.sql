-- Run this complete file once in Supabase SQL Editor after the seven HR core migrations.
-- WORK uses auth.users. Sync to HR in the same transaction, without sending mail.
BEGIN;

ALTER TABLE hr.employees ADD COLUMN IF NOT EXISTS auth_deleted_at timestamptz;
ALTER TABLE hr.invitations ADD COLUMN IF NOT EXISTS auth_deleted_at timestamptz;
ALTER TABLE hr.audit ALTER COLUMN actor_id DROP NOT NULL;
COMMENT ON COLUMN hr.audit.actor_id IS 'HR employee responsible for a user action; NULL for an authenticated account lifecycle trigger (see action/reason).';

ALTER TABLE hr.employees DROP CONSTRAINT IF EXISTS employees_auth_id_fkey;
ALTER TABLE hr.employees ADD CONSTRAINT employees_auth_id_fkey FOREIGN KEY(auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE hr.invitations DROP CONSTRAINT IF EXISTS invitations_auth_id_fkey;
ALTER TABLE hr.invitations ADD CONSTRAINT invitations_auth_id_fkey FOREIGN KEY(auth_id) REFERENCES auth.users(id) ON DELETE SET NULL;
-- A recreated login must never inherit the deleted person's employee ID, history or privileges.
ALTER TABLE hr.employees DROP CONSTRAINT IF EXISTS employees_organization_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS hr_employee_current_email ON hr.employees(organization_id,email) WHERE auth_deleted_at IS NULL;
ALTER TABLE hr.invitations DROP CONSTRAINT IF EXISTS invitations_organization_id_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS hr_invitation_current_email ON hr.invitations(organization_id,email) WHERE auth_deleted_at IS NULL;

CREATE OR REPLACE FUNCTION hr.deactivate_work_account(account_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
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

CREATE OR REPLACE FUNCTION hr.sync_work_account(account_id uuid) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
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

CREATE OR REPLACE FUNCTION hr.sync_all_work_accounts() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
DECLARE account_id uuid; count_before bigint; excluded integer:=0;
BEGIN
  SELECT count(*) INTO count_before FROM hr.employees;
  FOR account_id IN SELECT id FROM auth.users ORDER BY id LOOP
    IF hr.sync_work_account(account_id) IS NULL THEN excluded:=excluded+1; END IF;
  END LOOP;
  RETURN jsonb_build_object('added',(SELECT count(*) FROM hr.employees)-count_before,'total',(SELECT count(*) FROM hr.employees),'unlinked_or_deleted',excluded);
END $$;

CREATE OR REPLACE FUNCTION hr.on_work_account_created_or_updated() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
BEGIN
  IF TG_OP='INSERT' THEN PERFORM hr.sync_work_account(NEW.id);
  ELSIF (to_jsonb(NEW)->>'deleted_at') IS DISTINCT FROM (to_jsonb(OLD)->>'deleted_at') AND to_jsonb(NEW)->>'deleted_at' IS NOT NULL THEN
    PERFORM hr.deactivate_work_account(OLD.id);
  ELSIF NEW.email IS DISTINCT FROM OLD.email AND coalesce(to_jsonb(NEW)->>'deleted_at','')='' THEN
    PERFORM hr.sync_work_account(NEW.id);
  END IF;
  RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION hr.on_work_account_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
BEGIN PERFORM hr.deactivate_work_account(OLD.id); RETURN OLD; END $$;

DROP TRIGGER IF EXISTS hr_work_account_created_or_updated ON auth.users;
CREATE TRIGGER hr_work_account_created_or_updated AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION hr.on_work_account_created_or_updated();
DROP TRIGGER IF EXISTS hr_work_account_deleted ON auth.users;
CREATE TRIGGER hr_work_account_deleted BEFORE DELETE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION hr.on_work_account_deleted();

-- Reusing an email for a new account may create a new invitation; archived invitations remain visible.
CREATE OR REPLACE FUNCTION hr.invitation_command(e hr.employees,p jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE invitation hr.invitations; address text:=lower(hr.text_value(p,'email',3,254));
BEGIN
  IF e.role<>'admin' THEN PERFORM hr.fail('PT403','관리자만 직원을 초대할 수 있습니다.'); END IF;
  PERFORM hr.only_keys(p,array['email','name','department','role','employment_start_date']);
  IF address !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' OR p->>'role' NOT IN ('employee','admin') OR NOT p?'employment_start_date' THEN PERFORM hr.fail('PT400','이메일·역할·입사일을 확인해 주세요.'); END IF;
  IF EXISTS(SELECT 1 FROM hr.employees WHERE organization_id=e.organization_id AND email=address AND auth_deleted_at IS NULL) THEN PERFORM hr.fail('PT409','이미 등록된 직원입니다.'); END IF;
  INSERT INTO hr.invitations(organization_id,email,name,department,role,employment_start_date,invited_by)
    VALUES(e.organization_id,address,hr.text_value(p,'name',1,100),hr.text_value(p,'department',0,100),p->>'role',(p->>'employment_start_date')::date,e.id) RETURNING * INTO invitation;
  RETURN to_jsonb(invitation);
END $$;

CREATE OR REPLACE FUNCTION public.hr_finish_invitation(p_id uuid,p_auth_id uuid,p_success boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
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

-- Take the organization lock before invitation rows, as account deletion and HR commands do.
-- Never send mail or reconcile an archived invitation against a replacement account.
CREATE OR REPLACE FUNCTION public.hr_claim_invitation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
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

CREATE OR REPLACE FUNCTION public.hr_reconcile_invitation(p_id uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
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

-- A fresh HR installation also imports WORK accounts that existed before HR was initialized.
CREATE OR REPLACE FUNCTION public.hr_bootstrap(p_auth_id uuid,p_name text,p_start_date date,p_organization_name text DEFAULT 'HR & Work Dashboard') RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=hr,pg_temp AS $$
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

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA hr FROM public,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.hr_bootstrap(uuid,text,date,text),public.hr_finish_invitation(uuid,uuid,boolean) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.hr_bootstrap(uuid,text,date,text),public.hr_finish_invitation(uuid,uuid,boolean) TO service_role;

-- Backfill existing WORK accounts now. Triggers maintain new additions/deletions afterwards.
SELECT hr.sync_all_work_accounts() AS work_hr_sync_result;
NOTIFY pgrst,'reload schema';
COMMIT;
