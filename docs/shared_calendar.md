# 공용캘린더

- 메인 대시보드의 **공용캘린더** 카드 → `/calendar`.
- 공용 워크스페이스의 활성 로그인 사용자는 일정을 함께 조회·등록·수정·삭제한다. 익명 사용자에게 공개하지 않는다.
- 일정 필드: 제목, 날짜, 회의 종류, 시작시간, 소요시간, 참여자, 메모. 한국시간 기준이다.
- 날짜 버튼 또는 빈 날짜 영역을 더블클릭하면 해당 날짜의 일정 등록창을 연다. 일정은 한 번 클릭하면 날짜를 선택하고, 더블클릭하면 수정창을 연다. 키보드 Enter/Space로도 등록·수정할 수 있다.
- 일정을 다른 날짜로 마우스 드래그하면 날짜만 변경한다. 시작시간·소요시간·참여자·강의 연결은 유지하고, 오래된 버전의 이동 요청은 409로 거부한다.
- 새 일정의 기본 소요시간은 1시간이다. 제목의 `11시`, `오후 2시 반`, `11시 30분`, `14:30` 등을 시작시간에 반영한다. 오전·오후가 없는 1~7시는 오후로 해석하며, 허용 범위/30분 간격 밖의 시간은 자동 반영하지 않는다. 수동 시작시간 선택과 기존 소요시간은 보존한다.
- 참여자는 같은 워크스페이스의 이메일 인증 완료·비활성/차단되지 않은 사용자 중 복수 선택한다. 전체 선택·선택 해제가 가능하며, 0명도 유효하다. 참여자 디렉터리 장애가 일정 저장을 막지 않는다.
- 수정창의 **공유** 버튼은 현재 입력한 제목·한국시간·종류·연결 강의·참여자·메모를 일반 텍스트로 복사한다. 카카오톡 등에 붙여넣을 수 있다. 클립보드 접근이 거부되면 직접 선택·복사할 텍스트를 보여준다. 외부 메시지를 자동 발송하지 않는다.
- 시작시간: 08:00~21:00, 30분 간격. 소요시간: 30분~24시간, 30분 간격. 종료가 다음 날이면 이를 표시한다. 21:00 제한은 시작시간에 적용한다.
- 기본 종류: 강사 줌미팅, 리허설, 웨비나, 주간회의.
- 최고관리자 `/admin`의 **회의 항목 추가** 섹션 또는 워크스페이스 관리자 `/admin/calendar`에서 종류를 추가한다. 중복 이름은 거부한다.
- 강사 줌미팅에는 같은 워크스페이스의 강의를 선택적으로 연결할 수 있다. 다른 종류로 변경하면 강의 연결을 해제한다.
- 강의 상세페이지 하단에 연결된 모든 일정과 메모를 날짜·시간순으로 표시한다. 강의 삭제는 일정 자체를 삭제하지 않고 연결만 해제한다.
- 캘린더는 30초 주기 및 창 포커스 시 다른 사용자의 변경을 새로 조회한다. 편집 중 다른 사용자가 변경한 일정은 저장/삭제 시 409로 거부하여 덮어쓰지 않는다.

## 데이터와 권한

`shared_calendar_meeting_types`, `shared_calendar_events` 테이블 및 `calendar_private` 권한/검증 함수. RLS는 실제 Auth 계정의 비활성/차단 상태와 워크스페이스 구성원·관리자 역할을 확인한다. 회의 종류 추가만 관리자에게 허용하며 기본 종류의 식별 코드를 사용자 정의 항목으로 위조할 수 없다. 일정의 시간 간격과 범위, 강의/종류/워크스페이스 연결은 DB에서도 검증한다.

마이그레이션: `supabase/migrations/20261008090358_shared_calendar.sql`.

참여자 확장: `supabase/migrations/20261008100344_shared_calendar_participants.sql`. `participant_ids uuid[]`의 기본값은 빈 배열이고 일정/버전과 원자적으로 저장한다. 새 선택은 비공개 트리거에서 같은 워크스페이스의 활성·인증 계정인지 검증한다. 중복·NULL·다차원 배열·500명 초과 선택을 거부한다. 이후 탈퇴/삭제/비활성화된 기존 참여자는 이력으로 유지할 수 있으며 제거 후 다시 추가할 수는 없다. 이전 버전의 열린 클라이언트가 참여자 필드를 생략하면 기존 선택을 보존한다. 트리거는 고정 search_path를 사용하고 API 역할의 직접 실행을 금지한다.

## 검증

```powershell
npx.cmd tsx --conditions=react-server --test src/lib/shared-calendar/*.test.ts
node scripts/verify-shared-calendar.mjs --playwright-module <playwright/index.mjs의 로컬 경로>
npm.cmd run db:check
npm.cmd run build
```

브라우저 검증은 운영 빌드의 화면과 API를 로컬 PGlite/Postgres RLS 테스트 DB에 연결한다. 실제 Supabase 계정·메일·일정은 생성하거나 변경하지 않는다.

전체 테스트에서 기존에 확인된 주의 사항: Windows 한국어 Intl 오전/오후 표기 3건, 강사 수집 테스트의 오래된 마이그레이션 파일 경로 1건, `react-server` 실행 조건에서 `react-dom/server`를 가져오는 WBS 테스트 1건. WBS 테스트를 `npx.cmd tsx --test src/components/course-wbs/wbs-gantt.test.ts`로 별도 실행하면 6건이 통과한다.

## 2026-10-08 검증 결과

- 공용캘린더 단위·DB 테스트 17건, 운영 빌드 브라우저/API/SQL 통합 검증 13건 통과.
- 운영 빌드 성공. 소스 lint 오류 0건; 기존 경고 2건은 이번 변경 범위 밖이다.
- 전체 테스트 최초 실행: 537건 중 529건 통과, 기존 실패 5건, 건너뜀 3건. 이후 요청 호스트 검증 테스트 1건을 추가해 새 기능의 테스트 17건을 재검증했다.
- 운영 마이그레이션 버전 `20261008090358` 적용. 로컬/원격 마이그레이션 이력이 일치한다.
- 운영 Supabase의 실제 앱 조회식 성공, 익명 요청은 `42501`로 차단. 실제 일반 구성원 역할의 조회에서 종류 4건·구성원 접근 허용·관리자 접근 거부 확인. 테스트용 운영 일정은 남기지 않았다.
- 공용캘린더 관련 보안/성능 WARN·ERROR 없음. 데이터가 아직 없는 새 일정 인덱스 4개에 [미사용 인덱스 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index)가 표시되며, 조회·외래키 처리를 위한 인덱스이므로 유지한다.
- 기존 프로젝트 보안 권고는 이번 작업에서 변경하지 않았다: [함수 search_path](https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable), [익명 SECURITY DEFINER 실행](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [인증 사용자 SECURITY DEFINER 실행](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [유출 비밀번호 보호](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). 새 권한 함수는 비공개 스키마·고정 search_path·호출자 계정/워크스페이스 검증을 사용한다.

## 2026-10-08 조작·참여자·공유 확장 검증

- 단위·DB 테스트 24건, 운영 빌드 기반 브라우저/API/SQL 통합 검증 24건 통과. 더블클릭, 실제 마우스 드래그, 시간 인식, 전체/복수/빈 참여자 선택, 클립보드 복사/차단, 오래된 클라이언트 및 충돌 요청, 디렉터리 장애와 키보드 조작을 검증했다.
- 전체 회귀 테스트: 545건 중 537건 통과, 기존 실패 5건, 건너뜀 3건. 실패 내용은 위 주의 사항과 동일하며 별도 WBS 실행 6건은 통과했다.
- 운영 빌드 성공, 소스 lint 오류 0건/기존 경고 2건. 활성 마이그레이션 23개와 변경되지 않은 아카이브 91개를 검사했다.
- 운영 마이그레이션 `20261008100344` 적용 및 원격 이력 일치 확인. 기존 일정 2건 보존. 실제 앱 조회식과 참여자 디렉터리 조회 성공, 익명 조회 `42501`, 일반 구성원의 참여자 필드 조회 정상. 운영 계정/메일/일정을 테스트 목적으로 생성·수정하지 않았다.
- 새 참여자 트리거의 API 역할 직접 실행 금지, 이벤트 RLS, 컬럼 변경 권한을 확인했다. 캘린더 관련 새 보안·성능 WARN/ERROR 없음. 기존 [미사용 인덱스 INFO](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) 3건과 프로젝트의 기존 권고는 유지한다.
