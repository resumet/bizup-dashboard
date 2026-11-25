# 짧은 주소 API 유형 전환 작업 요청

아래 요구사항에 따라 API 서버 구현, DB 마이그레이션, 테스트, API 명세와 사용 예시를 함께 수정해 주세요. 이 문서는 API 서버 개발 담당자에게 전달하는 작업 프롬프트입니다.

## 1. 전제 및 목표

- 현재는 테스트 기간입니다. 기존 4자리 숫자 `type` 방식의 하위 호환은 필요하지 않습니다.
- 기존 발급된 짧은 주소는 모두 제거하고 새 방식으로 다시 발급합니다. 기존 주소·링크 ID·리다이렉트 보존이나 데이터 변환은 필요하지 않습니다.
- 앞으로는 의미 있는 문자열 `type_key`만 사용합니다. 숫자 타입, 숫자 매핑, `legacy_code`, 숫자 코드 자동 배정 및 호환 분기는 만들지 않습니다.
- API 서버가 유형 목록의 단일 관리 주체가 됩니다. 대시보드는 이 목록을 조회하고 `type_key`로 발급을 요청합니다.
- 강의 UUID와 기존 API 키 인증 체계는 유지합니다. 강의, 사용자, API 키 등 링크 초기화와 무관한 데이터는 삭제하지 않습니다.

## 2. 유형 모델

최소 관리 항목:

| 필드 | 규칙 |
| --- | --- |
| `key` | 고유하고 변경 불가능한 식별자. 소문자 영문으로 시작하고 소문자 영문·숫자·밑줄만 허용. 1~64자 |
| `label` | 표시 이름. 앞뒤 공백 제거 후 1~120자. 변경 가능 |
| `active` | 활성 여부 |
| `created_at` | 생성 시각 |
| `updated_at` | 수정 시각 |

`key` 형식은 `^[a-z][a-z0-9_]{0,63}$`로 검증합니다. 대소문자를 임의로 변환하지 말고 잘못된 입력은 거부합니다.

초기 등록 유형은 다음 두 개입니다.

| key | label | active |
| --- | --- | --- |
| `landing` | 기본 랜딩 QR | true |
| `payment` | 결제페이지 QR | true |

- DB에서 `key`의 고유성을 보장합니다.
- 새로운 용도에는 새로운 key를 사용합니다. 기존 key를 다른 용도로 재배정하지 않습니다.
- 일반 발급 요청으로 유형을 자동 생성하지 않습니다.
- 유형 관리는 기존 관리자 기능 또는 관리자 전용 운영 절차로 제공합니다. 일반 링크 발급용 API 키에는 유형 추가·수정 권한을 주지 않습니다.
- 초기화 후 운영 중 사용된 유형은 삭제보다 비활성화를 사용하고 key를 재사용하지 않습니다.
- 이번 작업에서 별도 관리자 UI는 필수가 아닙니다. 유형 등록·이름 수정·비활성화 방법을 문서화해 주세요.

## 3. 유형 조회 API

```http
GET /api/v1/short-link-types
Authorization: Bearer <API 키>
```

성공 — HTTP 200:

```json
{
  "types": [
    { "key": "landing", "label": "기본 랜딩 QR", "active": true },
    { "key": "payment", "label": "결제페이지 QR", "active": true }
  ]
}
```

- 활성·비활성 유형을 모두 반환하며 `key` 오름차순으로 정렬합니다.
- 기존의 유효한 짧은 주소 생성용 API 키로 조회할 수 있어야 합니다.
- 별도 조회 권한을 추가한다면 기존 생성용 키에도 필요한 권한을 반영합니다. 기존 키의 폐기·재발급은 요구하지 않습니다.
- 비밀정보를 응답에 포함하지 않습니다.

## 4. 짧은 주소 발급 API

```http
POST /api/v1/short-links
Authorization: Bearer <API 키>
Content-Type: application/json
Idempotency-Key: <UUID>  (선택)
```

요청:

```json
{
  "course_id": "3f6c8c23-9e12-4c75-a4d2-6425ddcd2101",
  "type_key": "payment",
  "destination_url": "https://example.com/payment",
  "name": "AI 수익화 클래스 결제페이지"
}
```

예시 UUID는 실제 강의 UUID로 바꿔 사용합니다.

| 필드 | 필수 | 검증 |
| --- | --- | --- |
| `course_id` | 예 | 실제 존재하고 접근 가능한 강의 UUID |
| `type_key` | 예 | 위 형식에 맞는 등록된 유형 식별자 |
| `destination_url` | 예 | 최대 2,000자, http/https 전체 URL, 사용자명·비밀번호가 포함된 URL 금지 |
| `name` | 예 | 앞뒤 공백 제거 후 1~120자 |

- 기존 필드 `type`은 제거합니다. `type`만 보내거나 `type_key`와 함께 보내면 422 `VALIDATION_ERROR`를 반환합니다. 알 수 없는 필드를 조용히 무시하여 숫자 방식이 지원되는 것처럼 보이게 하지 않습니다.
- `type_key: "0001"`, 숫자형 값, 대문자, 공백이 포함된 식별자는 거부합니다.
- 현재 강의 UUID를 그대로 사용합니다. 별도의 강의 ID 매핑은 만들지 않습니다.
- 기존 API 키 인증·생성 권한·강의 접근 권한·강의 상태 검증·요청 제한은 유지합니다.
- 생성된 링크의 출처는 기존과 같이 `api`로 기록합니다.

## 5. 중복 및 비활성 처리

- 같은 강의에서 같은 유형은 하나의 링크만 가집니다.
- 내부 유형 ID를 사용한다면 `(course_id, type_id)`, 직접 key를 저장한다면 `(course_id, type_key)`에 DB 고유 제약을 적용합니다.
- 동시에 같은 강의·유형을 발급해도 중복 링크가 생기지 않아야 합니다. DB 충돌도 아래 409 응답으로 처리합니다.
- 기존 링크가 있으면 새 링크를 만들거나 이름·연결 주소를 덮어쓰지 않고 기존 주소를 반환합니다.
- 인증·권한·강의 검증을 먼저 수행합니다. 이후 기존 링크가 있으면 유형이 비활성이어도 409로 기존 주소를 반환합니다. 기존 링크가 없고 유형이 비활성이면 422 `LINK_TYPE_INACTIVE`로 생성을 거부합니다.
- 유형 비활성화는 이미 발급된 링크의 리다이렉트를 중단시키지 않습니다.

## 6. 성공 및 오류 응답

새 발급 성공 — HTTP 201:

```json
{
  "short_url": "https://bizup.im/Ab3dE7x",
  "short_code": "Ab3dE7x",
  "link_id": "76cb8534-125a-45f9-9081-e37e6b4805f4",
  "course_id": "3f6c8c23-9e12-4c75-a4d2-6425ddcd2101",
  "type_key": "payment",
  "type_label": "결제페이지 QR",
  "name": "AI 수익화 클래스 결제페이지",
  "destination_url": "https://example.com/payment",
  "created_at": "2026-11-26T00:00:00Z"
}
```

같은 강의·유형의 링크 존재 — HTTP 409:

```json
{
  "error": {
    "code": "LINK_TYPE_EXISTS",
    "message": "이 강의에는 같은 유형의 짧은 주소가 이미 있습니다.",
    "details": {
      "course_id": "3f6c8c23-9e12-4c75-a4d2-6425ddcd2101",
      "type_key": "payment",
      "type_label": "결제페이지 QR",
      "link_id": "76cb8534-125a-45f9-9081-e37e6b4805f4",
      "short_code": "Ab3dE7x",
      "short_url": "https://bizup.im/Ab3dE7x"
    }
  }
}
```

숫자 `type`과 `legacy_code`는 요청·응답·조회 API에 포함하지 않습니다.

| HTTP | error.code | 의미 |
| --- | --- | --- |
| 401 | `INVALID_API_KEY` | 키 누락·오류·폐기 |
| 403 | `INSUFFICIENT_SCOPE` | 권한 부족 |
| 409 | `LINK_TYPE_EXISTS` | 같은 강의·유형의 링크 존재 |
| 422 | `COURSE_REQUIRED` | 강의 ID 누락 또는 존재하지 않는 강의 |
| 422 | `COURSE_NOT_ACTIVE` | 종료 등 발급 불가능한 상태의 강의 |
| 422 | `UNKNOWN_LINK_TYPE` | 형식은 맞지만 등록되지 않은 type_key |
| 422 | `LINK_TYPE_INACTIVE` | 비활성 유형으로 신규 발급 시도 |
| 422 | `VALIDATION_ERROR` | 구형 type 필드 사용, type_key 누락·형식 오류, URL·이름 오류 등 |
| 429 | `RATE_LIMITED` | 요청 제한 초과 |

일반 오류는 `{ "error": { "code": "...", "message": "..." } }` 형식으로 반환합니다. 내부 SQL, API 키, 스택 트레이스는 노출하지 않습니다. 접근할 수 없는 강의의 존재 여부를 새로 노출하지 말고 기존 접근 거부 정책을 유지하며 명세에 명시합니다.

## 7. 멱등성

- 선택적 `Idempotency-Key` 지원을 유지하고 새로운 요청 구조에 맞게 처리합니다.
- 같은 키와 같은 요청을 재시도하면 원래 응답을 재사용하고 링크를 추가 생성하지 않습니다.
- 같은 키를 다른 요청 본문에 재사용하면 기존 서버의 충돌 오류 정책을 유지하고 정확한 코드·상태를 문서화합니다.
- 멱등성 키가 없거나 다른 키로 재요청해도 같은 강의·유형이면 409 `LINK_TYPE_EXISTS`로 기존 링크를 반환합니다.
- 기존 숫자 요청의 캐시된 응답이 초기화 후 다시 반환되지 않도록 정리합니다.

## 8. 테스트 데이터 초기화 및 마이그레이션

이번 작업에서는 기존 발급 주소 전체 삭제가 요구사항입니다. 별도의 숫자 타입 호환 계층이나 기존 링크 보존·백필 작업을 만들지 마세요.

1. 현재 스키마와 링크 참조 관계를 조사합니다.
2. 짧은 주소 발급 요청을 잠시 차단하거나 중지하여 초기화 중 구형 데이터가 다시 생성되지 않게 합니다.
3. 대상 짧은 주소 서비스의 기존 발급 링크 전체와 그 링크에 종속된 데이터·캐시를 정리합니다. 클릭 기록, 링크 전용 연결 데이터, 발급 멱등성 기록, 리다이렉트 캐시 및 CDN 캐시 등이 있으면 해당 범위를 확인하여 함께 정리합니다.
4. 강의·사용자·API 키·다른 서비스의 데이터는 삭제하지 않습니다. 광범위한 CASCADE로 무관한 데이터가 지워지지 않도록 참조 관계를 확인합니다.
5. 숫자 타입 전용 컬럼·제약·인덱스·검증·호환 분기를 제거하고 새 유형 모델과 링크의 유형 참조를 적용합니다.
6. `landing`, `payment` 유형을 등록합니다. 마이그레이션 재실행 시 중복 등록되지 않도록 합니다.
7. 서버 코드와 명세를 배포하고 검증한 뒤 발급을 재개합니다. 삭제한 주소는 더 이상 리다이렉트되지 않아야 합니다.

삭제 대상 및 건수, 마이그레이션 결과를 보고합니다. 초기화는 의도된 비가역 데이터 삭제이므로 롤백으로 기존 주소가 자동 복원된다고 안내하지 않습니다.

대시보드 DB는 별도 시스템입니다. API 서버 작업에서 직접 삭제하지 않습니다. 제거된 짧은 주소가 대시보드 입력창에 남아 있을 수 있으므로, 대시보드 담당자에게 정리 대상과 재발급 필요성을 알려 주세요. 원본 랜딩페이지·원본 결제페이지 URL은 유지해야 합니다.

## 9. 대시보드 연동 계약

대시보드 담당자가 다음처럼 수정할 수 있도록 최종 계약을 전달해 주세요.

| 버튼 | type_key | 연결 대상 | 발급 주소를 넣을 필드 |
| --- | --- | --- | --- |
| 기본 랜딩 QR 발급 | `landing` | 기본 랜딩페이지 | 기본 랜딩 QR |
| 결제페이지 QR 발급 | `payment` | 기본 결제페이지 | 결제페이지 QR |

- 대시보드는 유형 key와 버튼·입력 필드의 연결만 관리하고 숫자 매핑은 제거합니다.
- 유형 목록은 API 서버에서 조회합니다. 같은 의미의 유형을 임의로 중복 생성하지 않습니다.
- 신규 유형 추가 요청 시 서버 목록을 먼저 확인하고, 이미 있는 key라면 기존 용도를 알린 뒤 재사용 여부를 확인합니다.
- 유형 조회가 실패하거나 필요한 유형이 없으면 임의로 생성·대체하지 않고 오류를 안내합니다.
- 발급 API 키는 서버에만 보관하고 유형 조회·발급 호출도 서버를 통해 수행합니다.
- 발급 성공 시 `short_url`, 중복 시 `error.details.short_url`을 사용합니다.
- 대시보드가 새 요청 형식으로 전환되기 전에는 기존 숫자 요청이 실패합니다. API 서버 배포와 대시보드 전환 시점을 맞추고 이를 명시적으로 안내합니다.

## 10. API 명세와 예시 수정

실제 서버 구현과 공식 API 명세(OpenAPI/Swagger 등), README, 개발자 문서, SDK 또는 요청 타입 정의를 함께 수정합니다. 명세가 없다면 저장소에 OpenAPI 파일을 추가합니다.

필수 문서 내용:

- 유형 조회 API와 발급 API의 인증·권한·요청·응답
- `type_key` 필수값·형식·길이와 등록 여부 검증
- 숫자 `type` 방식 폐기 및 구형 요청 거부
- 같은 강의·유형의 중복 및 비활성 유형 처리 순서
- 모든 성공·오류 응답과 멱등성 규칙
- 유형 등록·수정·비활성화 절차
- 테스트 데이터 초기화 범위와 배포·대시보드 전환 순서
- 실제 실행 가능한 curl과 서버용 JavaScript 예시

유형 목록은 서버 데이터가 기준입니다. OpenAPI의 `type_key`에는 문자열 형식과 등록된 유형만 허용한다는 설명을 넣고 조회 API를 연결합니다. 새 유형을 등록할 때마다 오래된 고정 enum 때문에 클라이언트가 거부하지 않도록 합니다.

curl 예시:

```bash
curl https://bizup.im/api/v1/short-link-types \
  -H "Authorization: Bearer $BZUP_API_KEY"

curl -X POST https://bizup.im/api/v1/short-links \
  -H "Authorization: Bearer $BZUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "course_id": "실제 강의 UUID",
    "type_key": "payment",
    "destination_url": "https://example.com/payment",
    "name": "AI 수익화 클래스 결제페이지"
  }'
```

서버용 JavaScript 예시:

```javascript
async function createShortLink({ courseId, typeKey, destinationUrl, name, idempotencyKey }) {
  const apiKey = process.env.BZUP_API_KEY;
  if (!apiKey) throw new Error('짧은 주소 API 키가 설정되지 않았습니다.');

  const response = await fetch('https://bizup.im/api/v1/short-links', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({
      course_id: courseId,
      type_key: typeKey,
      destination_url: destinationUrl,
      name,
    }),
    signal: AbortSignal.timeout(15000),
    redirect: 'error',
    cache: 'no-store',
  });

  const body = await response.json().catch(() => null);
  if (response.status === 201 && typeof body?.short_url === 'string') {
    return body.short_url;
  }
  if (response.status === 409 && body?.error?.code === 'LINK_TYPE_EXISTS'
      && typeof body.error.details?.short_url === 'string') {
    return body.error.details.short_url;
  }
  throw new Error(`짧은 주소 발급 실패: ${response.status} ${body?.error?.code ?? 'INVALID_RESPONSE'}`);
}
```

재시도 시 멱등성을 원하면 호출자가 UUID를 한 번 생성해 동일한 `idempotencyKey`로 전달해야 합니다. 이 예시는 브라우저가 아닌 서버에서만 사용합니다.

## 11. 테스트 및 완료 기준

- 초기화 후 기존 링크가 남지 않고 삭제된 주소가 리다이렉트되지 않는다.
- 초기 유형 조회 결과에 `landing`, `payment`가 있고 숫자 필드는 없다.
- 두 유형 각각 새 링크를 발급할 수 있다.
- 같은 강의·유형의 재발급은 409로 기존 주소를 반환한다.
- 서로 다른 강의의 같은 유형은 별도로 발급된다.
- 동시 발급에도 같은 강의·유형의 링크는 하나만 생긴다.
- 숫자 `type` 단독 요청 및 `type_key`와 함께 보낸 요청은 거부된다.
- 숫자형·숫자 문자열·대문자·누락·미등록 type_key를 정확한 오류로 처리한다.
- 비활성 유형 신규 발급은 거부하고, 기존 링크가 있으면 409로 반환한다.
- 인증·권한·강의 상태·URL·이름 검증과 요청 제한이 동작한다.
- 멱등성 재시도와 다른 본문 재사용 충돌이 명세대로 처리된다.
- 새로 발급된 주소의 리다이렉트가 정상 동작한다.
- 유형 목록·서버 검증·공식 API 명세·사용 예시가 서로 일치한다.

완료 보고에는 변경 파일, 초기화 대상·삭제 건수, 마이그레이션 및 테스트 결과, 배포 여부, 최종 명세 위치, 대시보드 담당자가 적용할 변경 사항을 포함해 주세요.
