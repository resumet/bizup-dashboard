# PRD — 강의별 외부 문서 작성 및 리드 수집 시스템

## 1. 프로젝트 목적

강의별로 외부 강사가 문서를 작성할 수 있는 간단한 문서 작성 시스템을 구축한다.

내부 관리자가 강의를 생성하고 외부 작성 URL을 발급한다.

외부 강사는 해당 URL을 통해 문서를 생성·조회·수정·삭제한다.

내부 관리자는 작성된 문서를 확인하고 공개 여부와 리드게이트 위치를 설정한다.

공개된 문서는 고유 URL을 가지며, 방문자가 리드게이트 이후 내용을 보기 위해 이름과 전화번호를 입력하면 해당 정보를 DB에 저장한다.

수집된 리드는 문서별·강사별로 조회하고 Excel로 다운로드할 수 있다.

---

# 2. 기술 스택

기존 프로젝트 환경을 사용한다.

```text
Frontend / Backend
- Next.js
- TypeScript

UI
- Tailwind CSS

Database
- Supabase PostgreSQL

Storage
- Supabase Storage

Deployment
- Vercel

Repository
- GitHub
```

가능한 한 별도의 외부 서비스를 추가하지 않는다.

---

# 3. 사용자 구분

## 3.1 내부 관리자

관리자 인증이 완료된 사용자.

권한:

- 강사 관리
- 강의 생성 / 수정 / 삭제
- 외부 작성 활성화 / 비활성화
- 외부 작성 URL 생성 / 재발급
- 강의별 문서 조회
- 모든 문서 조회
- 문서 수정
- 문서 삭제
- 문서 공개 / 비공개
- 공개 URL 확인 및 복사
- 리드게이트 설정 / 이동 / 해제
- 문서별 리드 조회
- 강사별 리드 조회
- 리드 Excel 다운로드
- 차단 전화번호 관리

---

## 3.2 외부 강사

별도 관리자 계정 없이 강의별 외부 작성 URL로 접근한다.

예:

```text
/write/{accessToken}
```

권한:

- 해당 강의 정보 확인
- 해당 강의 문서 목록 조회
- 문서 생성
- 문서 조회
- 문서 수정
- 문서 삭제
- 이미지 업로드
- 미리보기
- 저장

외부 강사에게 제공하지 않는 기능:

```text
강의 관리
리드게이트 설정
리드 목록
리드 통계
Excel 다운로드
차단 전화번호 관리
다른 강의 접근
```

---

## 3.3 일반 방문자

공개된 문서 URL로 접근한다.

예:

```text
/article/{slug}
```

권한:

- 공개 콘텐츠 열람
- 리드게이트 전 콘텐츠 열람
- 이름 / 전화번호 제출
- 제출 성공 후 전체 콘텐츠 열람

---

# 4. 핵심 데이터 관계

```text
Instructor
   │
   └── Course
         │
         └── Document
               │
               └── Lead
```

기본 관계:

```text
강사 1 : N 강의
강의 1 : N 문서
문서 1 : N 리드
강사 1 : N 리드
```

모든 문서는 반드시 강의에 연결한다.

모든 리드는 반드시 어떤 문서에서 발생했는지 추적 가능해야 한다.

---

# 5. 강사 관리

관리자 페이지:

```text
/admin/instructors
```

기능:

- 강사 생성
- 강사명 수정
- 강사 삭제
- 강사별 강의 확인
- 강사별 문서 수 확인
- 강사별 누적 리드 수 확인

강사 상세:

```text
/admin/instructors/{instructorId}
```

표시:

```text
강사명

강의 수
문서 수
공개 문서 수
총 리드 수

강의 목록
문서별 리드 현황

[전체 리드 Excel 다운로드]
```

---

# 6. 강의 관리

관리자 페이지:

```text
/admin/courses
```

기능:

- 강의 생성
- 수정
- 삭제
- 강사 연결
- 외부 작성 활성화 / 비활성화
- 외부 작성 URL 생성
- 외부 작성 URL 재발급
- URL 복사

강의 생성 필드:

```text
강의명
강사
상태
외부 작성 허용 여부
```

---

# 7. 외부 작성 URL

각 강의에는 추측하기 어려운 랜덤 access token을 생성한다.

예:

```text
/write/b9f4e92de21c47efa8e2a17dca923702
```

DB:

```text
external_access_token
external_edit_enabled
```

`external_edit_enabled = false`이면 해당 URL을 통한 모든 작성 접근을 차단한다.

화면:

```text
현재 외부 문서 작성이 비활성화되어 있습니다.
```

access token은 URL-safe random value를 사용한다.

순차 ID를 URL에 사용하지 않는다.

---

# 8. 외부 강사 문서 목록

URL:

```text
/write/{accessToken}
```

화면:

```text
강의명

[+ 새 문서]

문서 목록

제목
수정일
상태

[수정]
[삭제]
[미리보기]
```

해당 강의에 연결된 문서만 표시한다.

다른 강의의 문서는 절대 조회할 수 없다.

---

# 9. 문서 작성 기능

URL:

```text
/write/{accessToken}/new
```

수정:

```text
/write/{accessToken}/{documentId}
```

지원 요소:

```text
H1
H2
일반 문단
순서 없는 목록
순서 있는 목록
이미지
URL
CTA 버튼
```

외부 강사 화면에는 리드게이트 기능을 제공하지 않는다.

---

# 10. 에디터

Markdown 기반의 간단한 에디터를 구현한다.

사용자가 Markdown 문법을 몰라도 작성할 수 있도록 Toolbar를 제공한다.

Toolbar:

```text
H1
H2
목록
번호목록
이미지
링크
CTA
```

기본 UI:

```text
제목

[H1] [H2] [목록] [번호목록]
[이미지] [링크] [CTA]

----------------------------

본문 작성

----------------------------

[미리보기]

[저장]
```

자동저장은 필수 기능이 아니다.

명시적인 저장 버튼을 기본으로 한다.

---

# 11. 문서 콘텐츠 구조

리드게이트 위치 지정이 가능하도록 콘텐츠는 최소한의 Block 구조로 관리한다.

예:

```json
[
  {
    "id": "block_uuid_1",
    "type": "h1",
    "content": "릴스 조회수 올리는 방법"
  },
  {
    "id": "block_uuid_2",
    "type": "paragraph",
    "content": "릴스에서 가장 중요한 것은 첫 3초입니다."
  },
  {
    "id": "block_uuid_3",
    "type": "unordered_list",
    "items": [
      "결론부터 보여준다",
      "결과를 먼저 보여준다"
    ]
  }
]
```

지원 block type:

```text
heading1
heading2
paragraph
unordered_list
ordered_list
image
link
cta
```

각 block에는 변경되지 않는 UUID를 부여한다.

---

# 12. 이미지

Supabase Storage를 사용한다.

지원:

- 파일 선택 업로드
- Drag & Drop
- 가능하면 Clipboard 붙여넣기

업로드 성공 후 image block 생성:

```json
{
  "id": "block_uuid",
  "type": "image",
  "url": "...",
  "alt": ""
}
```

허용 이미지 형식과 최대 파일 크기를 설정한다.

예:

```text
jpg
jpeg
png
webp
```

---

# 13. URL 자동 링크

일반 paragraph 안에 URL이 포함되면 공개 페이지 렌더링 시 자동으로 링크 처리한다.

예:

```text
https://example.com
```

→ 클릭 가능한 링크.

외부 링크는 안전한 속성을 사용한다.

---

# 14. CTA

Toolbar의 CTA 버튼 클릭 시 입력:

```text
버튼 문구
URL
```

저장:

```json
{
  "id": "block_uuid",
  "type": "cta",
  "label": "무료강의 신청하기",
  "url": "https://example.com"
}
```

공개 페이지에서는 일반 링크가 아닌 CTA 버튼으로 표시한다.

---

# 15. 문서 상태

문서는 다음 상태를 지원한다.

```text
draft
published
```

관리자가 `published`로 설정한 문서만 공개 URL에서 접근 가능하다.

외부 강사가 문서를 작성했다고 자동 공개하지 않는다.

기본값:

```text
draft
```

최종 공개 권한은 내부 관리자에게 있다.

---

# 16. 공개 URL

형식:

```text
/article/{slug}
```

slug는 문서별 unique 값이어야 한다.

관리자 화면에서:

```text
공개 URL
[URL 복사]
```

기능을 제공한다.

draft 상태에서는 공개 URL로 접근해도 콘텐츠를 노출하지 않는다.

---

# 17. 관리자 문서 관리

URL:

```text
/admin/courses/{courseId}
```

강의별 문서 목록 표시:

```text
문서명
작성일
수정일
상태
리드 수
공개 URL

[보기]
[수정]
[리드게이트]
[URL 복사]
[삭제]
```

관리자는 외부 강사가 작성한 문서의 내용을 직접 수정할 수 있다.

---

# 18. 리드게이트

리드게이트 설정은 내부 관리자만 가능하다.

외부 강사 에디터에는 리드게이트 기능을 표시하지 않는다.

관리자 문서 편집/미리보기 화면에서 각 Block 사이에 마우스를 올리면 다음 버튼을 표시한다.

```text
+ 리드게이트
```

예:

```text
Block 1

Block 2

──────────────
+ 리드게이트
──────────────

Block 3

Block 4
```

버튼 클릭 시 해당 위치를 리드게이트 위치로 저장한다.

---

# 19. 리드게이트 위치 저장

documents 테이블:

```text
lead_gate_enabled
lead_gate_after_block_id
```

예:

```text
lead_gate_enabled = true
lead_gate_after_block_id = block_uuid_2
```

의미:

```text
block_uuid_2까지 공개

↓

Lead Gate

↓

block_uuid_3부터 잠금
```

관리자는 다음 기능을 사용할 수 있다.

```text
리드게이트 설정
위치 변경
리드게이트 해제
```

문서당 MVP에서는 리드게이트 1개만 허용한다.

---

# 20. 리드게이트 공개 화면

리드게이트 이전 콘텐츠를 정상적으로 렌더링한다.

지정 위치에 다음 Form을 표시한다.

```text
나머지 내용을 확인하려면 정보를 입력해주세요.

이름
[                     ]

전화번호
[                     ]

[계속 읽기]
```

입력 필드:

```text
name
phone
```

두 필드 모두 필수.

---

# 21. 리드 제출

리드 제출 시 서버에서 다음 순서로 처리한다.

```text
1. document 확인
2. published 상태 확인
3. 이름 검증
4. 전화번호 검증
5. 전화번호 normalize
6. 차단 전화번호 검사
7. 기존 리드 중복 검사
8. Lead 저장
9. 성공 응답
10. 나머지 콘텐츠 공개
```

프론트에서 Supabase에 직접 INSERT하지 않는다.

반드시 서버 API 또는 Server Action을 통해 처리한다.

---

# 22. 전화번호 Normalize

전화번호 비교용 `phone_normalized`를 생성한다.

예:

```text
010-1234-5678
010 1234 5678
01012345678
```

모두:

```text
01012345678
```

로 변환한다.

DB에는 원본과 normalize 값을 모두 저장할 수 있다.

```text
phone
phone_normalized
```

비교는 항상 `phone_normalized` 기준으로 한다.

---

# 23. 차단 전화번호

관리자 페이지:

```text
/admin/settings/blocked-phones
```

기능:

- 전화번호 추가
- 전화번호 삭제
- 메모 입력
- 등록일 확인

DB에는 normalized 전화번호만 비교용으로 사용한다.

차단 번호가 입력되면 Lead를 저장하지 않는다.

사용자 메시지:

```text
등록할 수 없는 전화번호입니다.
```

차단 사유는 사용자에게 공개하지 않는다.

---

# 24. 차단번호 보안

차단 전화번호 목록을 클라이언트로 전달하지 않는다.

잘못된 구조:

```text
Browser
→ blocked phone 전체 조회
→ JavaScript 비교
```

금지한다.

반드시:

```text
Browser
↓
Server API
↓
전화번호 Normalize
↓
blocked_phones 조회
↓
검증
↓
Lead INSERT
```

구조로 구현한다.

---

# 25. 중복 리드

동일한 전화번호가 같은 문서에서 반복 저장되지 않도록 한다.

Unique 기준:

```text
document_id + phone_normalized
```

DB Unique Constraint를 사용한다.

같은 사람이 동일한 문서에서 다시 정보를 입력하면:

```text
새로운 Lead INSERT 없음
콘텐츠는 정상적으로 Unlock
```

한다.

다른 문서에서는 같은 전화번호를 다시 Lead로 저장할 수 있다.

---

# 26. 리드 DB

필수 필드:

```text
id
document_id
course_id
instructor_id

name
phone
phone_normalized

utm_source
utm_medium
utm_campaign
utm_content

referrer

created_at
```

UTM 값은 공개 페이지 URL에서 자동으로 수집한다.

---

# 27. 문서별 리드

URL:

```text
/admin/leads/documents/{documentId}
```

표시:

```text
문서명
강사명
강의명

총 리드
오늘 리드
최근 7일 리드

----------------------------

이름
전화번호
등록일
UTM Source
UTM Medium
UTM Campaign

----------------------------

[Excel 다운로드]
```

---

# 28. 강사별 리드

URL:

```text
/admin/leads/instructors/{instructorId}
```

표시:

```text
강사명

총 문서 수
공개 문서 수
총 리드 수

문서별 리드

문서 A       321
문서 B       182
문서 C       91
```

문서를 클릭하면 해당 문서의 리드 목록으로 이동한다.

버튼:

```text
[전체 Excel 다운로드]
```

---

# 29. 리드 전체 관리

URL:

```text
/admin/leads
```

필터:

```text
기간
강사
강의
문서
```

표시:

```text
이름
전화번호
강사
강의
문서
유입경로
등록일
```

현재 필터 결과를 Excel로 다운로드할 수 있도록 한다.

```text
[현재 결과 Excel 다운로드]
```

---

# 30. Excel 다운로드

`.xlsx` 형식으로 다운로드한다.

컬럼:

```text
강사명
강의명
문서명
이름
전화번호
UTM Source
UTM Medium
UTM Campaign
UTM Content
Referrer
등록일
```

지원 다운로드:

```text
문서별 리드
강사별 전체 리드
관리자 필터 검색 결과
```

파일명 예:

```text
미닝_전체리드_2026-09-30.xlsx
```

또는:

```text
릴스조회수올리는방법_리드_2026-09-30.xlsx
```

---

# 31. DB Schema

## instructors

```sql
id uuid primary key
name text not null

created_at timestamptz
updated_at timestamptz
```

## courses

```sql
id uuid primary key

instructor_id uuid references instructors(id)

title text not null

external_edit_enabled boolean default false
external_access_token text unique

created_at timestamptz
updated_at timestamptz
```

## documents

```sql
id uuid primary key

course_id uuid references courses(id)
instructor_id uuid references instructors(id)

title text not null
slug text unique not null

content jsonb not null

status text default 'draft'

lead_gate_enabled boolean default false
lead_gate_after_block_id text

created_at timestamptz
updated_at timestamptz
published_at timestamptz
```

## leads

```sql
id uuid primary key

document_id uuid references documents(id)
course_id uuid references courses(id)
instructor_id uuid references instructors(id)

name text not null
phone text not null
phone_normalized text not null

utm_source text
utm_medium text
utm_campaign text
utm_content text
referrer text

created_at timestamptz
```

Unique Constraint:

```sql
unique(document_id, phone_normalized)
```

## blocked_phones

```sql
id uuid primary key

phone_normalized text unique not null
memo text

created_at timestamptz
```

---

# 32. 삭제 정책

강의 또는 강사를 삭제할 때 연결된 데이터를 무조건 Cascade Delete하지 않는다.

연결된 문서 또는 리드가 존재하면 관리자에게 확인한다.

MVP에서는 가능하면 실제 삭제보다 사용 중지 상태를 우선한다.

문서 삭제 시 해당 문서의 기존 리드 데이터를 실수로 같이 삭제하지 않도록 주의한다.

---

# 33. 보안 요구사항

외부 작성 URL은 추측하기 어려운 랜덤 token을 사용한다.

외부 작성 API 호출 시 항상 다음을 검증한다.

```text
accessToken 유효성
external_edit_enabled
course_id
document.course_id
```

URL의 documentId만 신뢰하지 않는다.

예를 들어 Course A의 token으로 Course B의 documentId를 직접 요청해도 접근할 수 없어야 한다.

Supabase Service Role Key를 클라이언트에 노출하지 않는다.

리드 등록과 차단번호 검증은 서버에서 처리한다.

관리자 API는 관리자 인증을 반드시 확인한다.

---

# 34. 공개 콘텐츠 보안

중요:

리드게이트 뒤의 콘텐츠를 초기 HTML이나 클라이언트 데이터에 포함한 뒤 CSS 또는 JavaScript로 단순히 숨기는 방식은 사용하지 않는다.

잘못된 예:

```text
전체 콘텐츠 Browser 전달
↓
CSS로 뒷부분 숨김
```

이 경우 개발자 도구로 숨겨진 내용을 볼 수 있다.

올바른 구조:

```text
GET 공개 문서
↓
서버가 리드게이트 이전 Block만 반환

Lead 제출
↓
서버 검증 성공
↓
Unlock 권한 발급
↓
리드게이트 이후 콘텐츠 요청
```

Unlock 상태는 서명된 HttpOnly Cookie 또는 서버에서 검증 가능한 방식으로 처리한다.

---

# 35. 관리자 화면 구조

```text
/admin
│
├── courses
│     └── {courseId}
│
├── instructors
│     └── {instructorId}
│
├── documents
│     └── {documentId}
│
├── leads
│     ├── documents/{documentId}
│     └── instructors/{instructorId}
│
└── settings
      └── blocked-phones
```

---

# 36. 외부 강사 화면 구조

```text
/write/{token}
│
├── 문서 목록
│
├── new
│
└── {documentId}
```

UI는 최대한 단순하게 구성한다.

외부 강사가 내부 관리자 메뉴에 접근할 수 없어야 한다.

---

# 37. 공개 페이지 구조

```text
/article/{slug}
```

처리:

```text
slug 조회
↓
published 여부 확인
↓
lead_gate_enabled 확인

NO
→ 전체 콘텐츠 반환

YES
→ lead_gate_after_block_id 이전까지만 반환
→ Lead Form 표시
```

Lead 성공:

```text
Lead 저장 또는 기존 Lead 확인
↓
Unlock
↓
전체 콘텐츠 표시
```

---

# 38. 관리자 리드게이트 UI

관리자가 문서를 열면 각 block 사이에 hover 영역을 둔다.

```text
Block 1

──────── + 리드게이트 ────────

Block 2

──────── + 리드게이트 ────────

Block 3
```

선택된 위치:

```text
Block 1

══════ LEAD GATE ══════
[위치 변경] [해제]

Block 2
```

한 문서에 하나의 리드게이트만 지원한다.

새 위치를 선택하면 기존 위치를 교체한다.

---

# 39. 주요 API / Server Action

예상 기능:

```text
ADMIN

createInstructor()
updateInstructor()

createCourse()
updateCourse()
regenerateExternalToken()

getCourseDocuments()

updateDocument()
deleteDocument()

publishDocument()
unpublishDocument()

setLeadGate()
removeLeadGate()

getLeads()
exportLeads()

addBlockedPhone()
removeBlockedPhone()
```

외부 작성:

```text
getExternalCourse(token)

getExternalDocuments(token)

createExternalDocument(token, data)

getExternalDocument(token, documentId)

updateExternalDocument(token, documentId, data)

deleteExternalDocument(token, documentId)
```

공개:

```text
getPublicDocument(slug)

submitLead(slug, name, phone, utmData)

getUnlockedDocument(slug)
```

---

# 40. MVP 제외 기능

다음 기능은 구현하지 않는다.

```text
Notion식 자유 블록 Drag & Drop
실시간 공동편집
댓글
멘션
페이지 트리
하위 페이지
워크스페이스
복잡한 사용자 권한
문서 버전 관리
테이블
Database View
AI 글쓰기
결제 Paywall
이메일 수집
SMS 발송
카카오 알림톡
리드 CRM
리드 자동 마케팅
```

향후 확장 대상으로만 고려한다.

---

# 41. 구현 우선순위

## Phase 1

```text
DB Schema
관리자 인증 연결
강사 CRUD
강의 CRUD
외부 작성 token
```

## Phase 2

```text
외부 강사 문서 목록
문서 작성
문서 수정
문서 삭제
Block Editor
이미지 업로드
CTA
```

## Phase 3

```text
관리자 문서 관리
문서 공개
공개 URL
Public Renderer
```

## Phase 4

```text
관리자 Lead Gate 설정
Lead Form
전화번호 Normalize
차단 전화번호
중복 방지
Content Unlock
```

## Phase 5

```text
문서별 Lead
강사별 Lead 집계
기간 / 강의 / 문서 필터
Excel 다운로드
```

---

# 42. 완료 조건

MVP는 아래 전체 흐름이 정상 작동하면 완료로 판단한다.

```text
1. 관리자가 강사를 생성한다.

2. 관리자가 강의를 생성하고 강사를 연결한다.

3. 외부 문서 작성 기능을 활성화한다.

4. 외부 작성 URL을 강사에게 전달한다.

5. 강사가 URL로 접속한다.

6. 강사가 여러 문서를 작성한다.

7. 강사가 기존 문서를 다시 열어 수정할 수 있다.

8. 강사가 문서를 삭제할 수 있다.

9. 관리자가 강의별로 작성된 모든 문서를 확인한다.

10. 관리자가 문서를 검수하고 필요한 경우 수정한다.

11. 관리자가 문서의 특정 Block 뒤에 Lead Gate를 지정한다.

12. 관리자가 문서를 Published 상태로 변경한다.

13. 공개 URL이 정상 작동한다.

14. 방문자는 Lead Gate 이전 콘텐츠만 볼 수 있다.

15. 방문자가 이름과 전화번호를 입력한다.

16. 차단 전화번호이면 등록되지 않는다.

17. 정상 전화번호이면 Lead DB에 저장된다.

18. 성공 후 나머지 콘텐츠가 표시된다.

19. 동일 전화번호가 같은 문서에 다시 등록되어도 Lead가 중복 생성되지 않는다.

20. 관리자가 문서별 Lead를 조회할 수 있다.

21. 관리자가 강사별 전체 Lead 수를 확인할 수 있다.

22. 관리자가 문서별 / 강사별 / 필터 결과를 Excel로 다운로드할 수 있다.
```

# 43. 개발 원칙

이 프로젝트는 Notion 전체를 복제하는 프로젝트가 아니다.

핵심 목표는 다음 흐름을 가장 단순하고 안정적으로 구현하는 것이다.

```text
강의 생성
    ↓
외부 작성 URL
    ↓
강사 콘텐츠 작성
    ↓
내부 검수
    ↓
Lead Gate 지정
    ↓
문서 공개
    ↓
Lead 수집
    ↓
글별 집계
    ↓
강사별 집계
    ↓
Excel 다운로드
```

기능 추가보다 이 핵심 흐름의 안정성을 우선한다.
