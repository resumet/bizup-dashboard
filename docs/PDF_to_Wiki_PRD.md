# PRD: PDF → Wiki 자동 변환 웹서비스

- 문서 버전: 1.0
- 작성일: 2026-10-16
- 대상: Codex 개발 에이전트
- 우선 구현 범위: MVP → 고도화
- 기본 기술 스택(제안): Next.js (App Router, TypeScript), Supabase (Auth/Postgres/Storage), Vercel, Python 문서 처리 워커

## 1. 프로젝트 개요

PDF 파일을 업로드하면 문서를 해석하여 **제목, 목차, 제목 단계, 본문, 문단, 목록, 표, 이미지, 캡션, 링크, 페이지 출처**를 가능한 한 유지한 상태로 **탐색·검색·편집 가능한 위키 페이지**로 자동 변환한다.

**중요:** PDF의 픽셀 단위 복제와 편집 가능한 위키 표현은 서로 다른 목표다. 기본 모드는 원본의 **논리적 구조 및 읽기 순서 보존**을 최우선으로 하며, 다단 편집·복잡한 표·슬라이드형 배치 등은 원본 미리보기와 병행한다. 변환 과정에서 확실하지 않은 내용은 임의로 생성하지 않고 사용자에게 검토 필요로 표시한다.

## 2. 목적과 성공 기준

### 목적
1. PDF를 수작업으로 복사하지 않고 위키로 재사용한다.
2. 목차·제목 계층·표·이미지 등 문서의 형식을 최대한 유지한다.
3. 위키에서 수정, 검색, 내부 링크, 원본 PDF 대조가 가능하게 한다.
4. 변환 결과를 신뢰할 수 있도록 페이지별 출처와 검수 기능을 제공한다.

### MVP 성공 기준 (검증 목표)
- 일반 텍스트 기반 PDF(최대 100쪽): 전체 변환 작업의 95% 이상 정상 종료 (테스트셋 기준)
- 제목/본문 읽기 순서 정확도 95% 이상 (사람이 평가한 테스트셋 기준)
- 표 셀 구조 보존율 90% 이상 (지원 대상 표에 한함)
- 변환된 모든 블록에 원본 페이지 번호 연결
- 사용자가 변환 결과를 편집하고 저장한 뒤 다시 열 수 있음
- 실패 원인 및 재시도 경로 확인 가능

> 상기 수치는 실제 성능 보장이 아니라 수용 테스트 목표값이다. 스캔, 다단 편집, 수식, 복잡한 도표 등은 난이도에 따라 품질 편차가 크다.

## 3. 사용자 시나리오

1. 로그인 후 **PDF 업로드** 버튼을 누른다.
2. PDF를 업로드하고 문서명·폴더를 지정한다.
3. 변환 옵션을 선택한다: `원본 구조 우선(기본)` / `읽기 최적화`, OCR 허용 여부, 이미지 포함 여부.
4. 업로드 이후 처리 상태(대기/분석/변환/검수 필요/완료/실패)가 표시된다.
5. 완료 후 자동 생성된 위키의 왼쪽 목차 트리에서 장·절을 이동한다.
6. 본문의 표, 이미지, 텍스트를 살펴보고 오른쪽 패널에서 원본 PDF의 해당 페이지와 비교한다.
7. 오류 블록을 직접 수정하거나 재변환을 요청한다.
8. 저장 후 검색 또는 위키 링크로 다른 문서와 연결한다.

## 4. 범위

### MVP 포함
- PDF 업로드, 타입/크기 검사, 문서별 처리 상태
- 텍스트 기반 PDF 우선 파싱 및 제한적 OCR 폴백
- 페이지·문단·제목(계층)·순서형/비순서형 목록 인식
- 표를 HTML/구조화된 테이블 블록으로 변환
- 삽입 이미지 추출·저장·표시, 이미지 캡션 추정
- 원본 PDF 보관 및 페이지별 원문 대조
- 목차 자동 생성 및 위키 페이지 분할(장/절 기준)
- WYSIWYG 형태의 위키 편집, 저장, 문서 검색
- 변환 오류·불확실 블록 표시 및 재시도
- 사용자별 문서 접근 제어

### 2차 개발
- 고급 OCR(한국어/영어 혼합), 손글씨·수식·복잡한 다단 문서
- PDF 내 표 및 그림의 고급 재구성, 각주·주석·상호 참조 연결
- 전체 문서/선택 절 단위 재변환 및 변경 비교(diff)
- 버전 이력, 공동 편집, 내보내기(Markdown/HTML/PDF)
- AI 기반 키워드 태그, 위키 간 자동 링크 추천
- 조직별 폴더 권한, 승인 워크플로, 대량 업로드

### 제외 (MVP)
- PDF 원본과 픽셀 단위 동일한 웹 레이아웃 보장
- 동영상/오디오 등 PDF 첨부 멀티미디어 재생
- 복잡한 수식의 완전한 편집 가능 형태 보장
- 문서에 없는 내용의 자동 보강·요약·의역

## 5. 핵심 기능 요구사항

### FR-01 업로드
- 허용 형식: `.pdf`만, MIME 및 파일 시그니처 검사.
- 초기 제한: 파일당 50MB, 100페이지(환경변수로 설정 가능).
- 암호화된 PDF 또는 손상된 파일은 명확한 안내와 함께 반려.
- 동일 파일 해시 기반 중복 업로드 감지(중복 생성 여부 사용자 선택).
- Supabase Storage의 비공개 버킷에 원본 보관.

### FR-02 분석 파이프라인
- PDF별 페이지 수, 페이지 크기, 텍스트층 유무, 이미지량, 회전, 컬럼 등을 판별.
- 텍스트층이 존재하면 좌표·글꼴 크기/두께 등의 정보를 가진 블록 추출.
- 텍스트층이 없거나 품질이 낮은 페이지는 선택적으로 OCR 수행.
- 머리말/꼬리말/쪽번호는 규칙 기반으로 식별하여 기본 본문에서 분리하되 원본 기록을 보존.
- 좌표 및 다단 구성에 따라 읽기 순서 추정. 신뢰도 낮으면 검수 대상으로 표시.

### FR-03 구조 및 서식 복원
- `document → sections → blocks` 형태의 중간 표현(IR)을 생성.
- 블록 타입: `heading`, `paragraph`, `list`, `table`, `image`, `caption`, `quote`, `code`, `divider`, `footnote`, `raw_fallback`.
- 제목은 글꼴 크기·두께·위치·번호 패턴 및 PDF 북마크를 활용해 H1~H6로 추정.
- 볼드/이탤릭/링크/줄바꿈 등의 인라인 서식을 보존.
- 표는 행·열·병합 셀·헤더를 가능한 범위에서 복원하고, 불가능하면 해당 부분의 이미지 스냅샷과 검수 경고 제공.
- 이미지 추출이 실패하면 원본 페이지/영역 이미지로 대체.
- 위키 블록별 `source_page`, `source_bbox`, `confidence`, `extraction_method` 저장.
- 한 문단이 PDF의 시각적 줄바꿈으로 나뉜 경우 의미 단위로 합치되 목록·코드·표의 줄바꿈은 유지.

### FR-04 위키 구성
- 문서마다 최상위 위키 공간/루트 페이지 생성.
- PDF 북마크가 있으면 기본 목차로 사용하고, 없으면 추정 제목 계층으로 목차 생성.
- H1/H2 또는 사용자 지정 깊이에 따라 자식 페이지 자동 생성(기본 H1 단위).
- 좌측: 문서 탐색 트리, 중앙: 위키 본문, 우측: 원본 PDF 비교 패널.
- 페이지 내 앵커, 이전/다음 페이지, 원본 페이지로 이동 기능.
- 동일 문서의 모든 블록에 출처 연결.

### FR-05 편집 및 저장
- 블록 기반 에디터(Tiptap/ProseMirror 등) 사용.
- 제목, 문단, 목록, 표, 이미지, 링크 수정 가능.
- 편집 이후에는 `user_edited=true` 표시, 자동 재변환 시 사용자 수정 내용 임의 덮어쓰기 금지.
- 저장 시 구조화된 JSON을 정본(source of truth)으로 유지; 필요 시 HTML/Markdown 파생 생성.
- HTML 표시 전 sanitization, 이미지 URL 접근 권한 검사.

### FR-06 검색
- 문서명, 제목, 본문 텍스트 검색(한국어 포함).
- 결과에서 키워드 강조, 위키 위치 및 원본 페이지 표시.
- 기본 검색 범위는 로그인 사용자가 접근 가능한 문서만.

### FR-07 품질 점검
- 변환 결과에 문제 유형 표시: 읽기 순서 의심, 표 파싱 실패, OCR 신뢰도 낮음, 제목 계층 불명확, 추출 이미지 누락.
- 검수 패널에 문제 블록 목록, 원본 영역, 수정 바로가기 제공.
- 완료 시 `변환 완료`와 `검수 필요`를 구분; 처리 실패 시 로그와 재시도 제공.
- 텍스트가 적은 페이지를 무조건 빈 페이지로 삭제하지 않음.

## 6. 화면 설계

### 화면 A: 문서 목록
- 위키 문서 목록, 검색, 폴더, 생성일, 처리 상태, 검수 필요 개수
- PDF 업로드 버튼

### 화면 B: 업로드/변환
- 드래그 앤 드롭 업로드
- 문서명, 폴더, 변환 모드, OCR 옵션
- 처리 진행률: 업로드 → 추출 → 구조 분석 → 위키 생성 → 완료
- 실패·취소·재시도 안내

### 화면 C: 위키 뷰어
```text
┌──────────────────┬──────────────────────────────────┬─────────────────────┐
│ 위키 목차 트리    │ 제목 / 본문 / 표 / 이미지          │ 원본 PDF 미리보기    │
│ 1장              │                                  │ [원본 12페이지]      │
│  ├ 1.1           │ 선택 블록 강조                    │ 해당 영역 강조       │
│  └ 1.2           │ 편집 / 저장 / 검색                 │ 페이지 이동          │
└──────────────────┴──────────────────────────────────┴─────────────────────┘
```
- 모바일에서는 원본 PDF 비교 패널을 탭/드로어로 전환.

## 7. 기술 아키텍처

### 권장 구성
- **프론트엔드:** Next.js App Router, TypeScript, Tailwind CSS, Tiptap, PDF.js
- **DB/인증/파일:** Supabase Auth, PostgreSQL, Storage, Row Level Security(RLS)
- **API:** Next.js Route Handlers 또는 Server Actions (인증·CRUD·잡 생성)
- **문서 처리:** Python 워커 + PyMuPDF(fitz), pdfplumber, 필요 시 OCR 엔진
- **비동기 작업:** 지속성 있는 작업 큐(예: Supabase Postgres 기반 큐 또는 관리형 큐) + 별도 워커
- **배포:** Next.js는 Vercel, PDF/OCR 워커는 긴 실행을 지원하는 별도 실행 환경

> 큰 PDF와 OCR을 Vercel의 일반 HTTP 요청 안에서 동기 처리하지 않는다. 업로드/작업 생성 즉시 응답하고 워커가 별도 수행한다.

### 파이프라인
```text
Client PDF Upload
  → Authorization + file validation
  → Private Storage (original PDF)
  → Create conversion_job (queued)
  → Background Worker
      → PDF inspection
      → Text + geometry extraction
      → OCR fallback per page
      → Reading order / heading / table / image inference
      → Intermediate Representation (IR JSON)
      → Wiki page & block generation
      → Quality flags + source references
  → Database commit
  → Client status polling / realtime notifications
  → User review & edits
```

### AI 활용 원칙
- 기본은 규칙 기반/문서 파서 사용. AI 모델은 제목 계층·읽기 순서·복잡한 표 등 해결이 어려운 구간에 선택적으로 적용.
- AI 입력은 추출된 텍스트·레이아웃/필요한 페이지 이미지만 전달하고 민감 문서 외부 전송 동의/관리 정책을 마련.
- AI에게 내용을 새로 작성하게 하지 않는다. 원문 누락·추가·의역 가능성을 검증하고, 불확실한 결과는 검수 표시.
- AI 호출 시 모델, 프롬프트 버전, 사용량, 비용, 실패 여부 기록. 모델 API 키는 서버에만 저장.

## 8. 데이터 모델 (초안)

### `documents`
- `id` UUID PK
- `owner_id` UUID FK → auth.users
- `title` TEXT
- `folder_id` UUID NULL
- `original_file_path` TEXT
- `sha256` TEXT
- `page_count` INT
- `status` ENUM(`uploaded`,`queued`,`processing`,`needs_review`,`completed`,`failed`)
- `created_at`, `updated_at` TIMESTAMPTZ

### `conversion_jobs`
- `id` UUID PK, `document_id` UUID FK
- `status` TEXT, `stage` TEXT, `progress` INT
- `options` JSONB, `error_code` TEXT, `error_message` TEXT
- `attempts` INT, `started_at`, `finished_at`, `created_at`
- 서버 측 idempotency key/lock으로 중복 작업 실행 방지

### `wiki_pages`
- `id` UUID PK, `document_id` UUID FK, `parent_id` UUID NULL
- `title` TEXT, `slug` TEXT, `sort_order` INT, `heading_level` INT
- `created_at`, `updated_at`

### `wiki_blocks`
- `id` UUID PK, `page_id` UUID FK
- `type` TEXT, `content_json` JSONB, `sort_order` INT
- `source_page` INT, `source_bbox` JSONB NULL
- `confidence` NUMERIC NULL, `extraction_method` TEXT
- `user_edited` BOOLEAN DEFAULT FALSE
- `review_status` TEXT DEFAULT 'unreviewed'

### `document_assets`
- `id` UUID PK, `document_id` UUID FK
- `storage_path` TEXT, `media_type` TEXT
- `source_page` INT, `source_bbox` JSONB NULL, `metadata` JSONB

### `conversion_issues`
- `id` UUID PK, `document_id` UUID FK, `block_id` UUID NULL
- `issue_type` TEXT, `severity` TEXT, `description` TEXT
- `resolved_at` TIMESTAMPTZ NULL

### `document_versions` (2차)
- `id`, `document_id`, `version_no`, `snapshot_path`/`snapshot_json`, `created_by`, `created_at`

**데이터 정책:** IR(JSON)을 디버깅 가능하게 별도 비공개 Storage에 보관하고, 위키 편집 정본은 `wiki_blocks`에 저장. 수정/재변환 충돌 방지 정책을 명시한다.

## 9. API 설계 (예시)

| Method | Endpoint | 동작 |
|---|---|---|
| POST | `/api/documents/upload` | 서버 검증 후 업로드 정보/서명 URL 발급 |
| POST | `/api/documents/:id/convert` | 변환 작업 생성 |
| GET | `/api/documents` | 권한 내 문서 목록 |
| GET | `/api/documents/:id` | 문서 메타데이터·상태 |
| GET | `/api/documents/:id/jobs/latest` | 변환 단계·진행률 조회 |
| GET | `/api/documents/:id/pages` | 위키 목차 트리 |
| GET | `/api/wiki/pages/:id` | 페이지·블록 조회 |
| PATCH | `/api/wiki/pages/:id` | 편집 내용 저장 |
| GET | `/api/documents/:id/source-url` | 원본 PDF 단기 서명 URL |
| GET | `/api/search?q=...` | 접근 가능 문서 내 검색 |
| POST | `/api/documents/:id/retry` | 실패 작업 재시도 |

- 모든 API 인증·소유권 검사 필수.
- 업로드/변환/재시도는 속도 제한 적용.
- 작업 상태 변경은 서버·워커만 가능.

## 10. 보안, 개인정보, 운영

- Supabase RLS로 본인(또는 명시적 조직 권한) 문서만 조회/수정 가능.
- 원본 PDF·파생 이미지·IR은 private Storage 버킷에 저장하고 짧은 만료의 서명 URL 발급.
- PDF를 신뢰하지 않는 입력으로 처리: 압축 폭탄, 과도한 페이지, 악성 첨부/스크립트, 링크 악용 방어.
- PDF 파서는 제한된 권한의 격리 워커에서 실행; 리소스/메모리/시간 제한.
- 로그에는 원문 내용·개인정보를 원칙적으로 남기지 않는다.
- 파일 삭제 시 DB, 원본, 추출 이미지, IR, 검색 색인을 함께 정리.
- 변환 잡은 재시도·중복 실행·부분 실패에 안전하게 설계.
- 한글 폰트 및 OCR 지원 여부는 배포 환경별로 테스트.
- 처리 시간 및 AI/OCR 비용 모니터링, 사용자별 쿼터 및 운영 예산 상한 설정.

## 11. 비기능 요구사항

- 접근성: 키보드 목차 탐색 및 표 스크린리더 지원.
- 반응형 UI: 데스크톱 3패널, 모바일 단일 패널.
- 대용량 문서: 페이지 단위 처리/진행률, 본문 가상화 또는 지연 로딩.
- 검색 성능: 소규모 초기 DB에선 PostgreSQL FTS/pg_trgm, 한국어 품질은 별도 검증.
- 안정성: 실패 시 이전 데이터 보존, 상태/에러 추적, 멱등성 있는 재처리.
- 관측성: 업로드, 변환 단계별 지연, 오류율, OCR 비율, 품질 플래그 수 기록.

## 12. 개발 단계 및 우선순위

### P0: 작동하는 세로 흐름
1. Next.js/Supabase 프로젝트, 로그인 및 RLS
2. PDF 업로드 및 비공개 원본 저장
3. `conversion_jobs` 큐와 Python 워커 연결
4. 텍스트 기반 PDF에서 문단/제목/목차 추출
5. IR → `wiki_pages`/`wiki_blocks` 저장
6. 위키 뷰어 및 원본 PDF 패널
7. 에디터 저장 및 기본 검색

### P1: 구조 보존 품질
1. 표 추출 및 원본 스냅샷 fallback
2. 이미지/캡션 추출
3. 다단 읽기 순서 개선
4. OCR 폴백, 검수 이슈 및 신뢰도 UI
5. 재시도·로깅·운영 지표

### P2: 고도화
1. 버전 비교·복구
2. Markdown/HTML 내보내기
3. 링크 자동 추천/태그
4. 공동 편집 및 권한 관리
5. 복잡한 문서 전용 모델 및 평가 루프

## 13. 수용 테스트 (Given / When / Then)

1. **기본 텍스트 PDF:** 제목·문단·목차가 있는 PDF 업로드 시 위키 페이지가 생성되고 원문 읽기 순서가 유지된다.
2. **표 포함:** 표가 있는 PDF 변환 시 가능한 경우 편집 가능한 표로, 어려운 경우 원본 이미지와 검수 경고로 표시된다.
3. **이미지 포함:** 그림 및 캡션이 본문 내 대략적인 위치에 나타나고 원본 페이지로 이동한다.
4. **스캔 PDF:** OCR 사용 승인 시 텍스트를 추출하고 인식 불확실 구간을 표시한다.
5. **다단 레이아웃:** 섹션의 자연스러운 읽기 순서를 평가하고 애매한 페이지는 검수 대상으로 표시한다.
6. **사용자 편집:** 문단 수정 후 새로고침해도 내용이 유지되고 원본 출처 연결이 살아 있다.
7. **접근 통제:** 사용자 A는 사용자 B의 PDF, 위키, 이미지를 직접 URL로 조회할 수 없다.
8. **중복 작업:** 같은 변환 요청 연속 수행 시 불필요한 중복 페이지/블록이 생기지 않는다.
9. **오류 대응:** 손상된 PDF 또는 워커 실패 시 상태/원인이 표시되고 안전하게 재시도할 수 있다.
10. **충실도:** 대표 테스트 PDF 20개(텍스트, 표, 이미지, 스캔, 다단 등)로 누락 블록·순서·표 구조를 수동 대조해 목표 지표 기록.

## 14. Codex 구현 지시

1. 먼저 저장소 구조와 기존 Next.js/Supabase 사용 여부를 조사한 후 현 프로젝트 규칙을 따른다.
2. 새 프로젝트라면 `apps/web`(Next.js), `services/converter`(Python), `supabase/migrations` 구조를 제안한다.
3. 우선 **P0의 end-to-end 완성**을 목표로 하고 OCR/AI/복잡 표는 확장 인터페이스로 분리한다.
4. `IR` TypeScript 타입과 Python Pydantic 모델을 동기화할 수 있도록 JSON Schema를 정의한다.
5. DB 마이그레이션, RLS 정책, Storage 정책, API, 워커, 프론트 UI, 환경변수 예제를 모두 포함한다.
6. 워커는 단계별 진행 상태를 기록하고 멱등성·재시도를 지원한다.
7. 외부 모델을 호출하는 코드는 추상화하여 모델 교체가 가능하게 하며, 기본 구현은 API 키 없이도 텍스트 PDF를 처리해야 한다.
8. `README.md`에 로컬 실행, DB 마이그레이션, 워커 실행, 배포, 오류 복구 절차를 설명한다.
9. 샘플 PDF를 이용한 단위 테스트와 최소 1개의 통합 테스트를 제공한다.
10. 완성 후 실제 업로드→변환→위키 조회→수정→재접속 플로우를 테스트하고 제한 사항을 보고한다.

## 15. 기본 결정사항 및 확인이 필요한 항목

**현재 PRD의 기본 가정**
- 기존 개발 흐름을 고려해 Next.js + Supabase + Vercel을 선택한다.
- 위키는 외부 Notion/Confluence에 게시하는 것이 아니라 **서비스 내부 위키**로 구현한다.
- 원본 형식 보존의 의미는 ‘시각적 픽셀 복제’가 아닌 **구조·서식·표·이미지의 최대한 복원**이다.
- 위키 데이터는 사용자 편집 가능하다.

**개발 시작 전 선택 가능한 확장 옵션**
- 외부 위키(Notion/Confluence) 동기화 필요 여부
- 스캔 PDF 비중과 OCR 제공 방식/비용
- 사내 비공개 문서를 외부 AI 모델로 전송할 수 있는지 여부
- 파일 용량·페이지 제한 및 대량 일괄 변환 필요 여부
- 원본 레이아웃 보존 우선 vs 편집 용이성 우선

---

**MVP 완료 정의:** 사용자가 PDF를 업로드하면 비동기 변환 후 문서 구조가 살아 있는 내부 위키를 열고, 원본과 대조하고, 검색하고, 수정·저장할 수 있다.
