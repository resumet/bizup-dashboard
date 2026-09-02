# DirecTalk 문자·알림톡 API 연동 스펙

## 1. 목적

DirecTalk API를 이용하여 서비스 내부에서 다음 기능을 제공한다.

- 카카오 알림톡 즉시 발송
- 카카오 알림톡 예약 발송
- 수신자별 템플릿 변수 치환
- 알림톡 실패 시 SMS/LMS 자동 대체발송
- 발송 결과 조회
- 개별 수신자 성공/실패 조회
- 예약 발송 취소
- 중복 발송 방지
- 샌드박스 모의 발송
- 향후 독립 SMS/LMS 발송 API 지원

서비스 UI에서는 사용자가 DirecTalk API 구조를 몰라도 발송할 수 있도록 내부 API를 한 단계 추상화한다.


# 2. 외부 API 기본 정보

Base URL

```text
https://api.directalk.io
```

API Version

```text
/public/v1
```

인증 방식

```http
Authorization: Bearer {DIRECTALK_API_KEY}
```

또는

```http
X-Api-Key: {DIRECTALK_API_KEY}
```

권장 방식은 `Authorization: Bearer`로 통일한다.

환경변수:

```env
DIRECTALK_API_KEY=
DIRECTALK_CHANNEL_ID=
DIRECTALK_DEFAULT_SENDER_NUMBER=
DIRECTALK_ENV=production
```

개발환경에서는 반드시 sandbox API Key를 사용한다.

```env
DIRECTALK_ENV=sandbox
DIRECTALK_API_KEY=dk_test_xxxxxxxxx
```


# 3. 중요한 인프라 제약

DirecTalk는 API Key별 호출 허용 IP CIDR 등록이 필요하다.

또한 해외 IP에서 API 호출이 차단된다.

따라서 DirecTalk API를 브라우저에서 직접 호출하면 안 된다.

구조:

```text
Browser
   ↓
Our Backend
   ↓
DirecTalk API
```

발송 서버는 반드시 한국 리전에 배치한다.

예:

- AWS Seoul
- GCP Seoul
- Naver Cloud Korea
- 국내 고정 IP 서버

Vercel 등 해외 IP가 나올 가능성이 있는 서버리스 환경에서 DirecTalk를 직접 호출하지 않는다.

필요하다면 별도 국내 API Gateway / relay server를 둔다.


# 4. DirecTalk API 응답 구조

DirecTalk API는 모든 결과를 envelope 구조로 반환한다.

성공:

```json
{
  "success": true,
  "message": "Request processed successfully",
  "data": {},
  "timestamp": "2026-09-02T10:00:00+09:00",
  "method": "POST",
  "path": "/public/v1/messages/alimtalk",
  "correlationId": "uuid"
}
```

실제 결과는 반드시

```text
response.data
```

가 아니라

```text
response.json().data
```

에서 가져온다.

실패:

```json
{
  "success": false,
  "message": "유효하지 않은 API 키입니다.",
  "code": 8621,
  "timestamp": "...",
  "method": "POST",
  "path": "...",
  "correlationId": "..."
}
```

주의:

`code` 값은 항상 존재하지 않는다.

따라서 Error Type은 다음처럼 정의한다.

```ts
interface DirectalkError {
  httpStatus: number
  code?: number
  message: string
  correlationId?: string
}
```

`correlationId`는 장애 추적을 위해 반드시 DB 또는 로그에 저장한다.


# 5. 알림톡 발송 API

외부 API:

```http
POST /public/v1/messages/alimtalk
```

정상 접수 HTTP Status:

```text
202 Accepted
```

주의:

`202`는 메시지 전달 성공을 의미하지 않는다.

의미는

```text
DirecTalk 발송 큐 접수 성공
```

이다.

실제 성공 여부는 이후 groupId로 조회해야 한다.


# 6. 알림톡 요청 모델

내부 모델:

```ts
interface AlimtalkRecipient {
  phone: string
  variables?: Record<string, string>
}

interface AlimtalkFallback {
  enabled: boolean
  channel?: "SMS" | "LMS"
  senderNumber?: string
  title?: string
  message?: string
}

interface SendAlimtalkRequest {
  channelId: string
  templateCode: string

  recipients: AlimtalkRecipient[]

  variables?: Record<string, string>

  removeDuplicates?: boolean

  scheduledAt?: string

  tags?: string[]

  fallback?: AlimtalkFallback

  idempotencyKey: string
}
```


# 7. 실제 DirecTalk Request 예시

```json
{
  "channelId": "@비즈업클래스",
  "templateCode": "WEBINAR_REMINDER_01",

  "recipients": [
    {
      "phone": "01012345678",
      "variables": {
        "이름": "김철수",
        "강의명": "해외구매대행 무료 웨비나"
      }
    }
  ],

  "variables": {
    "회사명": "비즈업클래스"
  },

  "removeDuplicates": true,

  "tags": [
    "WEBINAR"
  ],

  "fallback": {
    "enabled": true,
    "channel": "LMS",
    "senderNumber": "0212345678",
    "title": "무료 웨비나 안내",
    "message": "오늘 오후 7시 30분 무료 웨비나가 시작됩니다."
  }
}
```

Headers:

```http
Authorization: Bearer {DIRECTALK_API_KEY}
Content-Type: application/json
Idempotency-Key: webinar-123-reminder-1
```


# 8. 템플릿 변수 규칙

알림톡 템플릿:

```text
#{이름}님 안녕하세요.

#{강의명}이 곧 시작됩니다.
```

요청:

```json
{
  "variables": {
    "강의명": "해외구매대행 무료 웨비나"
  },
  "recipients": [
    {
      "phone": "01012345678",
      "variables": {
        "이름": "김철수"
      }
    }
  ]
}
```

변수 우선순위:

```text
recipient.variables
>
root variables
```

같은 변수가 양쪽에 있으면 수신자별 값이 우선한다.

템플릿에서 요구하는 변수가 누락되면 발송을 시도하지 말고 내부 validation 단계에서 막는다.


# 9. 전화번호 정규화

DB에는 가능한 한 다음 형태로 저장한다.

```text
01012345678
```

입력:

```text
010-1234-5678
010 1234 5678
```

등은 모두 정규화한다.

예:

```ts
function normalizePhone(phone: string) {
  return phone.replace(/\D/g, "")
}
```

발송 직전에 한 번 더 validation 한다.


# 10. 예약 발송

`scheduledAt`을 지정하면 예약 발송한다.

형식:

```text
ISO8601 + timezone
```

예:

```text
2026-09-10T19:30:00+09:00
```

절대 다음 값을 그대로 사용하지 않는다.

```ts
new Date().toISOString()
```

`toISOString()`은 UTC이므로 KST 예약에서 시간 오류가 발생할 수 있다.

서비스에서는 예약시간을 항상 Asia/Seoul 기준으로 관리한다.


# 11. 알림톡 실패 시 문자 대체발송

알림톡 요청의 `fallback`을 사용한다.

```json
{
  "fallback": {
    "enabled": true,
    "channel": "LMS",
    "senderNumber": "0212345678",
    "title": "웨비나 안내",
    "message": "오늘 오후 7시 30분 웨비나가 시작됩니다."
  }
}
```

지원 채널:

```text
SMS
LMS
```

알림톡 전달에 실패한 수신자에 대해서만 문자로 자동 발송된다.

UI에서는 다음 옵션으로 제공한다.

```text
[✓] 알림톡 실패 시 문자로 보내기

대체발송 방식
○ SMS
● LMS

발신번호
[02-1234-5678]

문자 제목
[무료 웨비나 안내]

문자 내용
[오늘 오후 7시 30분 무료 웨비나가 시작됩니다.]
```

대체발송에는 승인된 발신번호가 필요하다.


# 12. Idempotency 설계

모든 발송 요청에는 반드시

```http
Idempotency-Key
```

를 사용한다.

목적:

```text
사용자 더블 클릭
네트워크 timeout
서버 retry
worker 재실행
```

등으로 같은 메시지가 두 번 발송되는 문제를 방지한다.

잘못된 방법:

```ts
sendMessage() {
  const key = crypto.randomUUID()
}
```

재시도마다 UUID가 달라지므로 의미가 없다.

권장:

```text
{businessEvent}-{entityId}-{messageType}-{sequence}
```

예:

```text
webinar-382-reminder-1
webinar-382-reminder-2
order-12923-payment-complete
course-829-enrollment-complete
```

또는 DB 발송 Job 생성 시 UUID를 한 번 생성해 계속 재사용한다.

```text
message_jobs.idempotency_key
```

DirecTalk에서

```text
8627
```

이 오면

```text
ALREADY_ACCEPTED
```

으로 처리한다.

절대 자동 재발송하지 않는다.


# 13. 발송 접수 응답

성공 시:

```json
{
  "success": true,
  "data": {
    "groupId": "grp_xxxxxxxxx",
    "status": "QUEUED",
    "sendCount": 120,
    "optOutExcluded": 5,
    "holdAmount": 2300
  }
}
```

예약인 경우:

```text
status = RESERVED
```

즉시 발송:

```text
status = QUEUED
```

저장할 값:

```text
groupId
status
sendCount
optOutExcluded
holdAmount
correlationId
```


# 14. 발송 그룹 결과 조회

API:

```http
GET /public/v1/messages/{groupId}
```

발송 접수 이후 worker가 상태를 폴링한다.

폴링 주기:

```text
최소 5초
```

권장:

```text
5초
10초
15초
30초
30초
...
```

또는 기본적으로 5~10초 간격으로 진행한다.

Terminal Status:

```text
COMPLETED
FAILED
CANCELED
```

진행 중 상태:

```text
PENDING
SPLITTING
RUNNING
```

Terminal Status에 도달하면 폴링을 중지한다.


# 15. Group 상태 머신

```text
CREATED

  ↓

SUBMITTING

  ↓

QUEUED / RESERVED

  ↓

PENDING
  ↓
SPLITTING
  ↓
RUNNING

  ├── COMPLETED
  ├── FAILED
  └── CANCELED
```

우리 서비스 내부에서는 단순화하여:

```ts
type MessageJobStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELED"
```


# 16. 개별 발송 결과 조회

API:

```http
GET /public/v1/messages/{groupId}/details
```

Query:

```text
filter=ALL | FAILED
limit=100
cursor=...
```

최대 limit:

```text
1000
```

Pagination:

```text
nextCursor
```

가 null이 될 때까지 반복한다.

실패만 조회:

```http
GET /public/v1/messages/{groupId}/details?filter=FAILED&limit=1000
```

수신번호는 마스킹되어 내려오므로 전화번호를 기준으로 DB record를 매칭하면 안 된다.

반드시 발송 요청 recipients 배열의 index/seq와 내부 recipient ID를 연결해 둔다.


# 17. Recipient 매핑

DB:

```text
message_job_recipients

id
job_id
seq
contact_id
phone
variables
status
final_message_type
result_code
result_message
```

발송 시:

```ts
recipients.map((recipient, index) => ({
  ...recipient,
  seq: index
}))
```

DirecTalk 결과의 seq와 내부 seq를 매칭한다.

전화번호 마스킹 여부와 관계없이 정확히 수신자를 식별할 수 있어야 한다.


# 18. 예약 취소

API:

```http
DELETE /public/v1/messages/{groupId}
```

취소 성공 후:

```text
status = CANCELED
```

응답:

```json
{
  "groupId": "grp_xxxxx",
  "releasedHoldAmount": 3200
}
```

발송 서버에 이미 제출된 메시지는 취소할 수 없다.

이 경우:

```text
6911
```

에러가 반환될 수 있다.


# 19. 모의 발송

별도 URL을 사용하지 않는다.

같은 API를 호출하되 sandbox key를 사용한다.

```text
dk_test_xxxxxxxxx
```

예:

```http
POST https://api.directalk.io/public/v1/messages/alimtalk
```

Sandbox 환경에서도 성공 시 `202`.

`groupId`:

```text
sandbox-xxxxxxxxx
```

sandbox에서는 실제 발송이 생성되지 않으므로 다음 API는 사용하지 않는다.

```text
GET group
GET details
DELETE group
```

서비스에 개발용 메뉴를 제공한다.

```text
[모의 발송 테스트]
```

결과로 다음을 표시한다.

```text
예상 발송 건수
수신거부 제외
예상 홀드 금액
Validation 오류
```


# 20. 내부 API 설계

프론트엔드가 DirecTalk API를 직접 호출하지 않는다.

우리 서비스 API를 만든다.


## 알림톡 발송

```http
POST /api/messages/alimtalk
```

Request:

```json
{
  "templateId": "uuid",
  "recipients": [
    {
      "contactId": "uuid",
      "phone": "01012345678",
      "variables": {
        "이름": "김철수"
      }
    }
  ],

  "scheduledAt": null,

  "fallback": {
    "enabled": true,
    "channel": "LMS"
  }
}
```

Response:

```json
{
  "jobId": "uuid",
  "status": "QUEUED",
  "providerGroupId": "grp_xxxxx",
  "sendCount": 100
}
```


## 발송 상태 조회

```http
GET /api/messages/{jobId}
```


## 실패 수신자 조회

```http
GET /api/messages/{jobId}/recipients?status=FAILED
```


## 예약 취소

```http
POST /api/messages/{jobId}/cancel
```


## 모의발송

```http
POST /api/messages/alimtalk/preview
```


# 21. Database 구조

## message_templates

```text
id UUID PK

provider
channel

name

channel_id
template_code

title
content

variable_keys JSONB

fallback_title
fallback_content

created_at
updated_at
```


## message_jobs

```text
id UUID PK

provider

message_type

template_id

status

scheduled_at

idempotency_key UNIQUE

provider_group_id

requested_count
send_count
success_count
failed_count
opt_out_excluded

hold_amount

provider_correlation_id

error_code
error_message

created_by

created_at
submitted_at
finished_at
canceled_at
```


## message_job_recipients

```text
id UUID PK

job_id UUID FK

seq INTEGER

contact_id UUID NULL

phone

variables JSONB

status

final_message_type

result_code
result_message

created_at
updated_at
```


# 22. Provider Adapter 구조

향후 문자 API가 활성화되거나 업체 변경 가능성을 고려해 DirecTalk 코드를 서비스 로직과 분리한다.

```text
src/

messages/
  services/
    message-service.ts

  providers/
    message-provider.ts

    directalk/
      directalk-client.ts
      directalk-alimtalk.ts
      directalk-sms.ts
      directalk-types.ts
      directalk-errors.ts

  workers/
    message-status-worker.ts
```


interface:

```ts
interface MessageProvider {
  sendAlimtalk(
    input: SendAlimtalkRequest
  ): Promise<SendResult>

  getGroupStatus(
    groupId: string
  ): Promise<GroupResult>

  getMessageDetails(
    groupId: string,
    options?: GetDetailsOptions
  ): Promise<MessageDetailResult>

  cancel(
    groupId: string
  ): Promise<CancelResult>
}
```


향후 활성화:

```ts
sendSms()
```

를 추가한다.


# 23. 독립 문자 발송

현재 DirecTalk 개발자 문서에서는

```text
POST /public/v1/messages/sms
```

가 표시되어 있으나 `준비중` 상태이다.

따라서 현재 구현에서는 실제 호출하지 않는다.

대신 내부 API 및 인터페이스만 먼저 준비한다.

```ts
interface SendSmsRequest {
  recipients: {
    phone: string
  }[]

  senderNumber: string

  type: "SMS" | "LMS"

  title?: string

  message: string

  scheduledAt?: string

  idempotencyKey: string
}
```

DirecTalk에서 SMS API가 공개되면 Provider 구현체만 추가하도록 한다.


# 24. Error 처리 정책

재시도하지 않을 오류:

```text
400
401
403
404

6900 template not found
6904 recipients empty
6907 schedule invalid
6909 balance insufficient

6922 keyword blocked
6923 keyword held
6924 URL blocked

8620 API key missing
8621 invalid API key
8622 suspended
8623 expired
8624 IP blocked
8625 scope forbidden
8626 sandbox/live mismatch
```

특수 처리:

```text
8627
```

Idempotency conflict.

이미 접수된 것으로 취급하고 재발송하지 않는다.

재시도 가능:

```text
429
5xx
502
network timeout
connection reset
```

단, 발송 POST 재시도 시 동일한 Idempotency-Key를 반드시 사용한다.


# 25. Retry 정책

발송 POST:

```text
attempt 1
↓
1초
↓
attempt 2
↓
3초
↓
attempt 3
```

조건:

```text
network error
HTTP 429
HTTP 5xx
```

각 retry에서 반드시 동일:

```text
Idempotency-Key
```

를 사용한다.


# 26. 발송 Worker

Background job:

```text
message_status_worker
```

흐름:

```text
QUEUED
 ↓

DirecTalk group 조회
 ↓

PENDING / RUNNING
 ↓

재조회
 ↓

COMPLETED
 ↓

details 조회
 ↓

recipient 결과 저장
 ↓

job aggregate 갱신
```


Pseudo:

```ts
async function pollMessageJob(job) {

  const result =
    await provider.getGroupStatus(
      job.providerGroupId
    )

  await updateJobStatus(result)

  if (
    ["COMPLETED", "FAILED", "CANCELED"]
      .includes(result.status)
  ) {

    if (result.status === "COMPLETED") {
      await syncMessageDetails(job)
    }

    return
  }

  enqueuePoll(job.id, 5000)
}
```


# 27. UI 요구사항

메뉴:

```text
메시지

 ├─ 새 메시지
 ├─ 알림톡
 ├─ 문자
 ├─ 예약 발송
 ├─ 발송 내역
 └─ 템플릿
```


새 알림톡 화면:

```text
카카오 채널
[비즈업클래스]

템플릿
[웨비나 1시간 전 알림 ▼]

수신자
[Excel 업로드]
[고객 선택]

────────────────

메시지 미리보기

#{이름}님,
오늘 #{강의명}이 시작됩니다.

────────────────

변수 매핑

이름 → Excel 이름
강의명 → 공통값

────────────────

발송

○ 즉시 발송
○ 예약 발송

예약시간
2026-09-10
19:30

────────────────

☑ 알림톡 실패 시 문자 발송

문자방식
SMS / LMS

────────────────

[모의발송]

[발송하기]
```


# 28. 발송 내역 화면

컬럼:

```text
발송일시

유형

템플릿

대상

발송수

성공

실패

대체문자

상태

발송자
```

예:

```text
09/10 18:30

알림톡

웨비나 1시간 전

1,204명

1,180

1,162

18

12

완료
```


# 29. 발송 상세

상단:

```text
총 대상       1,204
실발송        1,180
성공          1,162
실패             18
대체문자         12
```

상태:

```text
COMPLETED
```

DirecTalk Group ID:

```text
grp_xxxxx
```

상세 목록:

```text
이름
전화번호
알림톡
대체문자
결과
실패사유
```


# 30. 알림톡 대체율 통계

DirecTalk 개별 결과의

```text
finalMessageType
```

을 저장한다.

예:

```text
AT = 알림톡

SM = SMS

LM = LMS
```

이를 통해

```text
알림톡 성공률

알림톡 → 문자 대체율

최종 전달 성공률
```

을 통계로 제공한다.


# 31. Security

절대 프론트엔드 환경변수에 API Key를 넣지 않는다.

금지:

```text
NEXT_PUBLIC_DIRECTALK_API_KEY
```

사용:

```text
DIRECTALK_API_KEY
```

API Key는 서버에서만 사용한다.

로그에도 API Key를 기록하지 않는다.

전화번호도 로그에 full value를 남기지 않는다.

예:

```text
010****5678
```


# 32. 발송 전 Validation

발송 버튼을 누르면 다음 순서로 검사한다.

```text
1. 수신자 존재

2. 전화번호 형식

3. 템플릿 선택

4. 템플릿 변수 누락

5. 예약시간 유효성

6. fallback 설정

7. senderNumber 존재

8. idempotency key 생성

9. DirecTalk sandbox validation 또는 실제 접수
```


# 33. 구현 우선순위

## Phase 1

알림톡 기본 발송

- API Client
- Template
- Recipient
- Variables
- Send


## Phase 2

발송 결과

- Group polling
- Status worker
- 발송 내역
- 발송 상세


## Phase 3

예약

- scheduledAt
- 예약 목록
- 예약 취소


## Phase 4

문자 대체발송

- SMS
- LMS
- fallback 설정
- 대체율 통계


## Phase 5

대량발송

- Excel 업로드
- 변수 mapping
- duplicate 제거
- chunk 발송


## Phase 6

독립 문자 발송

DirecTalk `/messages/sms` 정식 공개 이후 구현한다.


# 34. 대량발송 설계

수만 명을 한 번의 request로 보내지 않는다.

예:

```text
500~1,000명 단위
```

로 chunk 처리한다.

예:

```text
Campaign
   │
   ├── Job 1 (1~1000)
   ├── Job 2 (1001~2000)
   ├── Job 3 (2001~3000)
   └── Job 4
```

DB:

```text
message_campaigns

id
name
type
status

recipient_count

created_at
```

`message_jobs`에:

```text
campaign_id
```

를 추가한다.


# 35. Codex 구현 시 핵심 주의사항

다음 규칙은 반드시 지킨다.

1. DirecTalk API는 client/browser에서 호출하지 않는다.

2. API Key는 server-only 환경변수로 관리한다.

3. POST `/alimtalk` 성공 상태는 `200`이 아니라 `202`다.

4. API 응답값은 최상위가 아니라 `response.data` envelope 내부에 있다.

5. 모든 발송 요청은 Idempotency-Key를 사용한다.

6. 8627은 발송 실패가 아니라 기존 요청 접수 완료로 간주한다.

7. 접수 성공과 메시지 전달 성공을 구분한다.

8. groupId를 반드시 DB에 저장한다.

9. 발송 결과는 webhook이 아니라 polling 방식이다.

10. polling은 최소 5초 이상 간격을 사용한다.

11. COMPLETED / FAILED / CANCELED 상태가 되면 polling을 중지한다.

12. 개별 발송 결과의 전화번호는 마스킹되므로 seq 기반으로 수신자를 연결한다.

13. 예약시간은 반드시 KST timezone offset을 포함한다.

14. 개발환경에서는 sandbox API Key를 기본으로 사용한다.

15. 독립 SMS API는 현재 정식 구현하지 않고 adapter만 준비한다.


# 36. 완료 조건

다음 시나리오가 모두 동작하면 DirecTalk 연동 완료로 본다.

### 테스트 1
알림톡 1건 sandbox 발송

### 테스트 2
템플릿 변수 치환

### 테스트 3
수신자 100명 발송

### 테스트 4
중복 전화번호 제거

### 테스트 5
예약 알림톡 발송

### 테스트 6
예약 알림톡 취소

### 테스트 7
알림톡 실패 → LMS 대체

### 테스트 8
동일 Idempotency-Key 재호출

중복 발송이 발생하지 않아야 한다.

### 테스트 9
발송 완료 후 Group 상태 조회

### 테스트 10
실패 수신자 조회

### 테스트 11
Sandbox Key로 실제 발송이 발생하지 않는지 확인

### 테스트 12
잘못된 API Key / IP / 템플릿 / 변수에 대한 오류 표시

오류 화면에는 운영자용으로 correlationId를 함께 표시한다.