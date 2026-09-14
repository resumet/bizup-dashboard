# HR 설치 및 운영

요구사항 기준은 [HR PRD](hr_dashboard_prd.md)의 P0이다. 업무관리 선택 화면은 `/`, 기존 도구는 `/work`, HR은 `/hr`에서 제공한다. 기존 `/services/*` URL과 로그인 계정은 유지한다. HR은 별도 직원 명단의 활성 직원만 접근할 수 있다.

## 설치와 초기 관리자

1. 기존 환경과 동일하게 `npm install`을 실행한다.
2. Supabase의 마이그레이션 배포 절차로 `202609140001_hr_core.sql`부터 `202609140008_work_hr_account_sync.sql`까지 순서대로 적용한다. 이미 적용한 파일은 재실행하지 않는다. 다른 기능의 미적용 마이그레이션은 해당 배포 계획에 맞춰 처리한다.
3. 서버 환경에 기존 Supabase URL·anon key·service role key를 설정한다. 초대 링크의 기본 주소는 `https://bizup-dashboard.vercel.app`이며 `HR_APP_URL`로 변경할 수 있다. localhost 개발 시 HTTP를 허용한다. 비밀키는 `NEXT_PUBLIC_` 변수에 넣지 않는다.
4. 초기 관리자의 기존 인증 계정 이메일을 `HR_INITIAL_ADMIN_EMAIL`, 표시 이름을 `HR_INITIAL_ADMIN_NAME`, 입사일을 `HR_INITIAL_ADMIN_START_DATE`로 지정한다. 선택적으로 `HR_ORGANIZATION_NAME`을 지정한다.
5. `npx tsx scripts/hr/setup.ts`를 한 번 실행한다. 기존 인증 계정을 HR 관리자에 연결하며 초대 메일을 보내지 않는다. 이미 HR 조직이 있으면 초기화를 거절한다.
6. `npm run dev`로 실행하고 로그인 후 HR을 선택한다. 관리자에서 회사 근무정책·휴무일을 설정하고 직원 초대 버튼으로 직원을 추가한다.

초기 기본값은 서울 시간대, 월~금 09:00~18:00, 휴게 12:00~13:00, 반차 경계 14:00, 지각 여유 0분이다. 공휴일은 자동 수집하지 않는다. 관리자 설정에서 회사의 휴무일을 등록한다.

### SQL Editor에서 최초 설치

DB 연결 문자열 없이 설치하려면 `.env.local`에 초기 관리자 이메일을 설정하고 `npx tsx scripts/hr/build-install.ts`를 실행한다. 생성된 `tmp/hr-install.sql` 전체를 해당 Supabase 프로젝트의 SQL Editor에 붙여 넣고 `postgres` 역할로 한 번 실행한다. 이 파일은 마이그레이션 8개와 초기 관리자 연결·WORK 기존 계정 추가를 한 트랜잭션으로 처리하며, 실패 시 전체를 되돌린다. 이미 HR 스키마가 있으면 실행을 거절한다. 성공 시 위의 `setup.ts`는 별도로 실행하지 않는다.

이어서 `supabase/hr_schedule.sql`을 실행하면 매분 내부 알림과 정리 안내를 처리한다. 기존 HTTP 스케줄러를 사용한다면 SQL 스케줄러는 생략한다. `npx tsx scripts/hr/check-install.ts --admin`으로 RPC 설치 여부와 기존 관리자 인증 계정 존재 여부를 읽기 전용으로 확인할 수 있다. 관리자 계정 존재만으로 HR 관리자 연결까지 완료된 것은 아니다.

## 직원 초대와 인증

### WORK 계정 자동 연동

기존 HR 설치에는 `supabase/migrations/202609140008_work_hr_account_sync.sql` 전체만 SQL Editor에서 `postgres` 역할로 실행한다. 최초 설치 파일을 다시 실행하지 않는다. 적용 즉시 기존 WORK 계정을 일괄 연결하고 이후 `auth.users` 생성·삭제 트리거가 같은 트랜잭션에서 HR 직원을 처리한다. 앱 재배포나 별도 스케줄러는 필요 없다. 실행 결과의 `added`, `total`, `unlinked_or_deleted`는 추가 직원 수, 보관 기록을 포함한 총 직원 수, 이메일 누락·충돌·삭제 등 미연결 계정 수다.

- 새 WORK 계정은 HR 일반 직원으로 추가한다. 이름은 인증 프로필 이름, 없으면 이메일 앞부분이며 입사일은 등록일이다. HR 관리자가 미리 만든 초대가 있으면 그 초대의 이름·부서·권한·입사일을 사용한다. 사용자 프로필의 `role` 값으로 관리자 권한을 부여하지 않는다.
- 이미 연결된 직원의 이름·권한·활성 상태는 유지한다. HR에서 수동 비활성화한 직원이 로그인하거나 프로필을 수정해도 자동 활성화되지 않는다. WORK 계정의 이름·이메일 변경이나 로그인 차단/해제는 기존 HR 직원 정보를 변경하지 않는다.
- WORK 계정을 삭제하면 HR 직원은 비활성화하고 인증 연결을 해제한다. 근태·휴가·업무·정리·감사 기록은 기존 직원 ID로 보존한다. 인증 제공자의 소프트 삭제도 동일하게 처리한다.
- 같은 이메일로 다시 가입하면 새 직원 ID를 발급한다. 삭제 전 직원의 기록·관리자 권한은 상속하지 않는다. 기존 HR 직원의 이메일과 충돌하는 다른 인증 계정은 자동 연결하지 않는다.
- 마지막 활성 HR 관리자, 미완료 담당 업무가 있는 직원, 퇴근하지 않은 직원의 계정 삭제는 거절한다. 다른 관리자를 지정하거나 업무 인계·퇴근/정정을 먼저 처리한다. WORK의 다른 데이터가 계정 삭제를 막는 경우에도 HR 변경은 함께 취소한다.
- 현재 단일 HR 조직을 대상으로 한다. 조직이 없거나 여러 개인 경우 임의의 조직에 추가하지 않는다. 신규 계정 추가 시점에 로그인 제한 중인 계정은 비활성으로 추가한다.

### WORK의 기존 사용자 일괄 추가

자동 연동 마이그레이션 적용 후에는 아래 일회성 파일을 별도로 실행할 필요가 없다. 아래는 자동 연동 도입 전의 수동 일괄 추가 방식이다.

`supabase/hr_import_work_accounts.sql` 전체를 SQL Editor에서 실행하면 WORK 사용자 관리와 같은 `auth.users` 계정을 기존 HR 조직의 직원으로 추가한다. 초기 관리자 `resumet@gmail.com`의 활성 HR 관리자 연결이 필요하다. 기존 인증 ID·이메일을 재사용하며 인증 계정 생성이나 초대 메일 발송은 없다.

이미 HR에 연결된 계정은 그대로 유지하고 신규 직원은 일반 직원 권한으로 추가한다. 이름은 인증 프로필의 `full_name`, `name`, `user_name` 순서로 사용하고 없으면 이메일 앞부분을 사용한다. 입사일 기본값은 실행일이며 실제 입사일은 HR 직원 관리에서 수정한다. 로그인 제한 계정은 비활성으로 추가하고, 삭제·이메일 없는 계정은 제외한다. 이메일이 충돌하는 기존 HR 기록은 자동으로 덮어쓰지 않고 결과에 표시한다. 등록 이력을 저장하며 재실행해도 직원·이력이 중복 생성되지 않는다. 이번 실행의 추가·유지·제외 결과와 목록은 SQL Editor 결과로 확인한다.

### 새 직원 초대

- Supabase Auth의 공개 회원가입을 비활성화한다. 인증 제공자의 이메일 발송(SMTP)을 설정하고 Redirect URL 허용 목록에 `https://서비스주소/hr-invite`를 등록한다.
- 현재 서비스의 정확한 Redirect URL은 `https://bizup-dashboard.vercel.app/hr-invite`다. Auth 설정에서 이 주소를 허용해야 초대 메일의 로그인 완료 후 비밀번호 설정 화면으로 돌아온다.
- 새 직원에게는 Supabase 관리자 초대 메일을 보낸다. 기존 대시보드 인증 계정에는 새 계정을 만들지 않고 로그인 링크를 보낸 뒤 HR 직원 권한을 연결한다.
- 초대 페이지에서 비밀번호를 설정하고 공통 선택 화면으로 이동한다. 직원 정보 편집은 초대 메일을 발송하지 않는다.
- `hr_claim_invitation`은 한 요청만 발송권을 얻도록 한다. 네트워크 응답을 잃으면 중복 메일을 보내지 않는다. `sending`은 제공자 계정·전송 상태 확인이 필요한 상태다. 운영자는 관리자 초대 기록과 Auth의 사용자·메일 전송 기록을 대조한다.
- 인증 계정 생성은 확인되었는데 앱 반영이 실패한 경우 서버 권한으로 `hr_reconcile_invitation(p_id)`를 실행해 연결을 복구할 수 있다. 메일은 재발송하지 않는다. 알려진 발송 실패는 명시적 재시도 명령을 사용한다.
- 비활성화는 HR 접근·배정·참조 추가를 차단하고 기존 이력을 보존한다. 기존 업무관리의 계정 권한은 별도 정책이다. 마지막 활성 관리자는 강등·비활성화할 수 없다.

## 알림 작업

서버 환경에 충분히 긴 임의의 `CRON_SECRET`을 설정한다. 호스팅 스케줄러에서 **매분** 다음 요청을 실행한다.

```text
GET https://서비스주소/api/hr/cron
Authorization: Bearer <CRON_SECRET>
```

API 성공 응답 뒤에도 outbox 처리를 시도한다. 정기 작업은 앱이 닫혀 있어도 퇴근 전 정리 안내를 생성하고 미처리 이벤트를 재시도한다. 작업 실패는 원본 업무·휴가·근태 저장을 취소하지 않는다. 수신자별 유일성으로 중복 알림을 막는다. 오류 시 30초부터 최대 1시간까지 재시도 간격을 늘리며 성공할 때까지 보관한다.

Supabase에서 `pg_cron`을 사용할 경우 HTTP 스케줄러 대신 `supabase/hr_schedule.sql`을 운영자가 적용할 수 있다. DB 내부에서 매분 실행되며 URL·서비스 키를 작업 본문에 저장하지 않는다. 두 방식 중 하나를 설정하고 작업 실행 기록을 확인한다. 예약·실행 기록 확인 방법은 [Supabase Cron 공식 문서](https://supabase.com/docs/guides/cron/quickstart)를 따른다.

관리자 설정의 알림 처리 대기에서 시도 횟수·다음 처리 시각·오류 코드를 확인한다. 재가동 후 cron URL을 다시 호출하면 처리 시각이 된 이벤트부터 진행한다. SQL 관리자 작업으로 특정 outbox의 `next_retry_at`을 현재로 바꾸면 즉시 재처리할 수 있다. 성공 이벤트와 알림을 삭제해서 재처리하지 않는다.

## 데이터·권한과 동시성

- 제품 데이터는 PostgreSQL `hr` 스키마에 저장한다. 이 스키마를 PostgREST 노출 목록에 추가하지 않는다. 브라우저에는 테이블 권한을 주지 않는다.
- `hr_query`와 `hr_command`는 인증 세션의 `auth.uid()`로 직원·조직을 결정한다. 요청 본문으로 행위자나 조직을 정하지 않는다.
- 조직별 변경 잠금, 업무·근태·휴가 버전, 열린 근태/휴가 구간 유일성 제약을 함께 사용한다. 모든 변경 이력·outbox·멱등성 결과는 같은 트랜잭션에 저장한다.
- 관리자 현황은 활성 브라우저에서 30초마다 조회한다. 폼의 편집 상태는 조회 결과와 분리되어 있다. 서울 날짜로 조회하며 원본 시각은 UTC로 저장한다.
- 일일 정리는 불변 버전과 담당자·이름·업무 버전의 제출 스냅샷을 저장한다. 퇴근은 별도 명령이다. 정리 오류가 나거나 정리를 생략해도 퇴근을 처리할 수 있다.
- 휴가 사유는 본인/관리자의 상세 조회에만 제공한다. 일반 직원의 조직 캘린더에는 사유 필드가 없다. 접근을 잃은 업무의 알림에서는 상세 링크와 내용을 제거한다.
- 실제 근로시간·급여·법정 잔여 연차를 확정하는 서비스가 아니다. 시간 표시는 `참고 근무시간`, 휴가는 등록 단위 사용량이다.

## 개발용 가상 데이터와 검증

실제 개인정보를 사용하지 않는다. 로컬 Supabase를 준비한 경우 `HR_DEMO_PASSWORD`를 12자 이상 지정한 뒤 `npx tsx scripts/hr/setup.ts --demo`를 실행하면 가상 관리자 `hr-admin@example.test`, 직원 `hr-employee-1@example.test`~`3`과 업무를 생성한다. 비밀번호는 환경변수 값이며 로그에 출력하지 않는다. 이 명령은 localhost Supabase에서만 실행할 수 있다.

```text
npx tsx --conditions=react-server --test src/lib/hr/database.test.ts
npx tsx --conditions=react-server --test src/lib/hr/persistence.test.ts
npx tsx scripts/hr/verify-performance.ts
node scripts/hr/verify-browser.cjs
npx tsc --noEmit
npx eslint src/lib/hr src/components/hr src/app/hr src/app/api/hr src/app/hr-invite
```

브라우저 검증은 실제 컴포넌트·API·PostgreSQL(PGlite) 마이그레이션을 사용한다. 인증 전송부만 격리된 가상 계정으로 대체한다. Playwright가 다른 위치에 설치되어 있으면 `PLAYWRIGHT_PACKAGE_PATH`를 패키지 절대 경로로 설정한다. 결과와 화면은 `tmp/hr-browser/`에 생성한다. 이 검증만으로 운영 Supabase의 SMTP·배포 설정까지 확인되었다고 보지 않는다.

Windows 네이티브 PostgreSQL에서 독립 연결 20개의 경쟁·성능·서버 재시작을 검증하려면 `npm install --prefix tmp/hr-native --ignore-scripts --no-audit --no-fund @embedded-postgres/windows-x64@18.4.0-beta.17 pg` 후 `node scripts/hr/verify-postgres.cjs`를 실행한다. 프로젝트·운영 DB와 분리된 임시 DB만 생성하며 종료 시 서버를 중지한다. DB와 로그는 검토를 위해 `tmp/hr-native/data-*`에 보존하고, 결과는 `tmp/hr-browser/native-postgres.json`에 기록한다.

이 검증에는 `pg_dump` → 별도 DB에 `pg_restore` → 행 개수·본인 기록·타인 접근 차단·새 업무와 알림 처리가 포함된다. npm 서버 패키지는 백업 도구를 포함하지 않으므로 [PostgreSQL 공식 Windows 다운로드 안내](https://www.postgresql.org/download/windows/)의 EDB ZIP에서 PostgreSQL 18 클라이언트 도구를 준비하고, 해당 `bin` 폴더를 `HR_POSTGRES_TOOLS_BIN`으로 지정한다. 도구가 없으면 DB를 만들기 전에 명확한 오류로 종료한다. 로컬 가상 DB 복원 검증은 운영 Supabase 백업의 실제 복원 검증을 대신하지 않는다.

## 배포·백업·복구

- 배포 전에 DB 백업을 만들고 마이그레이션을 준비 환경에 먼저 적용한다. 앱 배포 전에 DB 마이그레이션을 적용한다. HR 데이터가 없으면 앱은 초기 설정 안내를 표시한다.
- PostgreSQL 백업 대상에 `hr` 스키마의 데이터·함수·시퀀스와 기존 `auth.users` 연결을 함께 포함한다. Supabase 제공 백업 또는 암호화된 `pg_dump` 전체 백업을 사용한다. 서비스 비밀키는 별도 비밀값 저장소에서 관리한다.
- 격리된 DB로 복원하고 직원-인증 ID 연결, 행 개수, 업무·정리·근태의 재조회, `hr` 권한 및 cron 재처리를 확인한 뒤 운영에 적용한다. 복원 중에는 앱 변경 요청과 알림 작업을 일시 중지한다.
- 배포 되돌리기는 우선 이전 앱 버전으로 수행한다. 기록을 보존하기 위해 HR 테이블을 자동 삭제하는 down migration은 제공하지 않는다.
- 회사가 보존 기간을 확정하기 전에는 근태·휴가·업무·감사·멱등성 기록을 자동 삭제하지 않는다. SQL 콘솔과 service role 접근은 운영 관리자에게만 허용한다.

## 인수 확인 상태

요구사항별 구현·검증 상태는 [추적 문서](hr-implementation.md)에 기록한다. 운영 DB 적용, SMTP와 초대 링크, 매분 스케줄러, 백업 복원은 해당 운영 환경에서 추가로 확인해야 한다.
