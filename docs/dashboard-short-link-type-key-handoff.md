# 대시보드 담당자 전달: 짧은 주소 유형(type_key) 전환

BZUP Link 짧은 주소 API가 숫자 `type`(0000~9999)에서 문자열 `type_key` 방식으로 바뀌었습니다.
공식 명세: https://bizup.im/docs/api · https://bizup.im/openapi.yaml

## 1. 반드시 알아야 할 점

- **기존에 발급된 짧은 주소는 모두 삭제되었습니다.** 삭제된 주소(`https://bizup.im/xxxxxxx`)는 더 이상 이동하지 않습니다(404).
  대시보드 입력창·DB에 남아 있는 기존 짧은 주소(기본 랜딩 QR, 결제페이지 QR 필드)는 비우고 **다시 발급**해야 합니다.
  원본 랜딩페이지·원본 결제페이지 URL은 그대로 유지하세요.
- **숫자 `type` 요청은 이제 실패합니다**(422 `VALIDATION_ERROR`). 대시보드를 새 요청 형식으로 바꾸기 전까지 발급이 되지 않습니다.
  API 서버 배포 시점과 대시보드 전환 시점을 맞춰 주세요.

## 2. 버튼과 type_key 연결

| 버튼 | type_key | 연결 대상 | 발급 주소를 넣을 필드 |
| --- | --- | --- | --- |
| 기본 랜딩 QR 발급 | `landing` | 기본 랜딩페이지 | 기본 랜딩 QR |
| 결제페이지 QR 발급 | `payment` | 기본 결제페이지 | 결제페이지 QR |

- 숫자 매핑(0001 등)은 제거하고, key와 버튼·입력 필드의 연결만 관리합니다.
- 유형 목록은 `GET /api/v1/short-link-types`로 서버에서 조회합니다. 같은 의미의 유형을 임의로 만들지 않습니다.
- 유형 조회가 실패하거나 필요한 유형이 없으면 임의로 대체하지 말고 오류를 안내합니다.
- 새 유형이 필요하면 BZUP Link 운영자에게 요청합니다(이미 있는 key인지 먼저 확인).

## 3. 호출 방법 (서버에서만)

```bash
curl https://bizup.im/api/v1/short-link-types -H "Authorization: Bearer $BZUP_API_KEY"

curl -X POST https://bizup.im/api/v1/short-links \
  -H "Authorization: Bearer $BZUP_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"course_id":"강의 UUID","type_key":"payment","destination_url":"https://example.com/payment","name":"AI 수익화 클래스 결제페이지"}'
```

- 발급 성공(201): `short_url` 사용
- 같은 강의·유형이 이미 있음(409 `LINK_TYPE_EXISTS`): `error.details.short_url` 사용
- 그 외 오류: `error.code`로 안내 (`UNKNOWN_LINK_TYPE`, `LINK_TYPE_INACTIVE`, `COURSE_NOT_ACTIVE`, `VALIDATION_ERROR` 등)
- API 키는 서버 환경변수에만 보관하고, 유형 조회·발급도 서버에서 호출합니다.
- 응답을 못 받아 재시도할 때 같은 결과를 원하면 `Idempotency-Key` 헤더에 같은 UUID를 넣습니다.

서버용 JavaScript 예시는 https://bizup.im/docs/api#examples 에 있습니다.
