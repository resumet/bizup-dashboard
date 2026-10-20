# PDF 변환 워커

기존 인스타그램 콘텐츠 편집기에 `PDF_to_Wiki_PRD.md`의 P0 흐름을 통합합니다. 별도의 위키 서비스를 만들지 않고 강의·자료 문서를 폴더와 루트 문서로 재사용합니다. 제목별 탐색은 문서 안의 섹션으로 제공하며 자동으로 별도 자식 문서를 만들지는 않습니다.

## 실행과 배포

Vercel의 기본 실행 방식은 `PDF_CONVERTER=sandbox`입니다(미설정해도 동일). 기존 프로젝트의 Workflow와 OIDC 인증으로 임시 Sandbox를 만들고 이 디렉터리의 Python 페이지 렌더러를 실행합니다. PDF 처리 중에는 Sandbox의 외부 네트워크를 차단하며 서비스 키는 전달하지 않습니다. 각 PDF 페이지는 1개의 PNG 파일로 만들어집니다. 처리가 끝나면 Sandbox를 삭제합니다. 별도 워커 서버나 새 API 키는 필요하지 않습니다. 배포 전 새 DB 마이그레이션을 적용해야 합니다.

아래 절차는 별도 컨테이너 워커를 운영할 경우에만 사용합니다. 이 경우 웹 앱에 `PDF_CONVERTER=external`을 설정해 Workflow와의 중복 실행을 방지합니다.

1. 프로젝트의 DB 마이그레이션 안내에 따라 `20261017012725_course_document_pdf_imports.sql`을 적용합니다. 적용 전 `supabase db push --linked --dry-run`으로 대상을 확인합니다. 기존 기준·보관 마이그레이션은 다시 실행하지 않습니다.
2. `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN`을 워커 환경에 설정합니다. `APP_ORIGIN`은 브라우저가 접속하는 앱 주소이며 파생 이미지 주소에 사용합니다. 워커 키는 브라우저에 전달하지 않습니다.
3. `pdf-worker` 디렉터리에서 이미지를 만들고 장시간 실행 가능한 컨테이너 환경에 배포합니다. 서버리스 HTTP 함수 안에서는 실행하지 않습니다.

```sh
docker build -t bizup-pdf-worker pdf-worker
docker run --rm --memory=2g --cpus=1 --pids-limit=64 --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=512m \
  --env-file .env.pdf-worker bizup-pdf-worker
```

로컬에서는 Python 3.11 이상에서 아래 명령을 실행할 수 있습니다. `.env.local`을 자동으로 읽지 않으므로 워커 환경은 실행 셸에 설정해야 합니다.

```sh
python -m pip install -r pdf-worker/requirements.txt
python pdf-worker/worker.py
```

웹 앱에는 기존 Supabase 설정과 선택적인 `PDF_MAX_FILE_BYTES`를 설정합니다. 워커에는 `PDF_MAX_FILE_BYTES`, `PDF_MAX_PAGES`로 기본 50MB·100페이지 제한을 더 낮출 수 있습니다. 상한을 늘리려면 Storage 버킷·DB 제약·IR 스키마·UI 제한을 함께 변경해야 합니다.

## 데이터 흐름과 접근 제어

- 웹 API가 기존 멤버십 또는 강의 외부 작성 토큰과 자료 연결을 확인합니다. 원본은 단일 객체 업로드 서명 URL로 비공개 Storage에 직접 전송합니다. API는 파일명·MIME·크기를, 워커는 실제 크기·PDF 시그니처·SHA-256·암호화·페이지 수를 검증합니다.
- `course_document_pdf_imports`가 업로드·큐·진행 상태·IR JSON을 보관합니다. RLS와 권한 회수로 브라우저에서 테이블을 직접 읽거나 작업 상태를 변경할 수 없습니다. 강의별 시간당 업로드는 20개로 제한합니다.
- `claim_course_document_pdf_import()`의 행 잠금과 `SKIP LOCKED`로 작업을 하나의 워커가 가져갑니다. 무작위 lease 토큰으로 이전 워커의 늦은 저장을 막습니다. 10분간 갱신되지 않은 작업은 최대 3번 자동으로 재수행합니다. 실패 작업의 수동 재시도도 3회로 제한합니다.
- 페이지 렌더러는 키가 제거된 별도 프로세스에서 최대 300초 실행합니다. 운영은 위 컨테이너의 CPU·메모리·PID 제한으로 격리합니다. 로그는 작업 ID·단계·시간·오류 분류만 남깁니다. 원문과 파일명은 로그에 남기지 않습니다.
- 원본 PDF는 편집 권한 검사 후 10분 서명 URL로 대조합니다. 이미지도 비공개 버킷에 저장하고 앱의 이미지 API에서 매번 작성 권한 또는 공개 문서의 리드게이트를 검사합니다. 외부 작성 토큰은 이미지 접근을 위해 HttpOnly·SameSite 쿠키에 한 시간 동안 보관합니다.
- IR은 JSON Schema로 검증하고 비공개 `ir.json`에도 기록합니다. 편집 정본은 기존 `course_documents.content` JSON입니다. 각 페이지 이미지의 원본 페이지·전체 영역·렌더링 방식을 노드 속성에 저장하고 편집 시 `userEdited`를 표시합니다.
- 변환은 기존 문서를 덮어쓰지 않습니다. 사용자가 결과를 본문 끝에 추가한 뒤 기존 저장 버튼으로 확정합니다. 새 변환·재시도는 사용자 편집 내용과 독립적입니다.
- 사용하지 않는 PDF는 변환 이력의 **PDF 삭제**로 원본·이미지·IR·이력을 함께 삭제합니다. 본문에 사용 중이거나 변환 중인 파일은 삭제를 막습니다. 문서가 서비스에서 삭제되면 워커가 매분 종료된 작업의 파일을 정리합니다.

## 테스트

```sh
python -m unittest discover -s pdf-worker -p test_convert.py -v
npx tsx --conditions=react-server --test src/lib/course-documents/pdf.test.ts src/lib/course-documents/pdf-database.test.ts
node scripts/verify-pdf-routes.cjs
npm run db:check
npm run build
```

Python 테스트는 실행 중 샘플 PDF를 생성해 페이지별 PNG 생성과 순서·크기·출처, 빈 페이지, 손상·암호·페이지 제한을 확인합니다. TypeScript 통합 테스트는 실제 페이지 이미지 결과를 편집 블록으로 검증하고 JSON 저장·재접속 후 출처가 보존되는지 확인합니다. DB 테스트는 비공개 권한, 동시 claim, lease 만료와 오래된 워커 저장 거부를 검증합니다. TypeScript의 PDF 통합 테스트 실행 환경에도 Python 의존성이 필요합니다.

실제 연결 환경에서는 강의 공개 작성 주소에서 업로드 → 변환 → 원본 대조 → 본문 추가 → 수정 → 저장 → 재접속을 확인하고, 다른 강의의 토큰으로 작업과 원본에 접근할 수 없는지 확인합니다. 로컬 환경에 운영 자격 증명이 없으면 실제 Supabase/Storage 연결 검증과 배포는 별도로 수행해야 합니다.

## 오류 복구와 제한

- 대기 상태가 계속되면 워커 프로세스와 환경변수, 큐 오류 로그를 확인합니다. 워커를 재시작해도 DB의 대기 작업은 유지됩니다.
- 손상·암호화·100페이지 초과·페이지 이미지 80MB 초과·8MB IR 초과는 실패 원인을 표시합니다. 비밀번호를 해제하거나 PDF를 나누어 다시 업로드합니다.
- 업로드 후 브라우저가 종료되면 이력의 **변환 시작**으로 큐에 넣을 수 있습니다. 실제 업로드가 중단된 파일은 새로 업로드합니다.
- 워커가 중단되면 lease 만료 후 다시 가져옵니다. 동일 작업의 재실행은 같은 Storage 경로를 덮어쓰고 결과 하나만 확정합니다. `원본 PDF 열기`를 다시 누르면 만료된 서명 URL을 갱신합니다.
- 본문·표·링크를 편집 가능한 텍스트로 추출하지 않습니다. 각 페이지 전체를 최대 1,600px의 PNG로 렌더링해 원래 배치를 그대로 보존합니다.
- 장별 별도 페이지 생성, 영역 강조, 협업·버전 비교·외부 위키 동기화는 포함하지 않습니다.
- PyMuPDF는 AGPL 또는 상용 라이선스를 사용합니다. 운영 배포에서는 사용하는 라이선스에 맞게 소스 제공 또는 상용 라이선스 조건을 확인합니다.
