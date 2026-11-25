# 짧은 주소 발급 API 키

유형의 기준은 API 서버의 `GET /api/v1/short-link-types`다. 새 유형 요청 시 서버 목록을 먼저 확인하고, 중복이면 기존 용도를 사용자에게 알린다. `src/lib/short-links/types.ts`는 화면 필드와 `type_key`의 연결만 관리한다. 숫자 `type`은 폐기되었다.

- 관리자 설정(`/admin`)의 **짧은 주소 발급 API 키**에서 등록·교체한다.
- 관리자 설정 페이지와 동일하게 최고관리자 이메일 또는 `workspace_members.role = super_admin`인 계정만 조회·저장할 수 있다.
- `GET /api/admin/short-url-key`는 `configured`, `updatedAt`만 반환한다. 원문과 암호문은 반환하지 않는다.
- `PUT /api/admin/short-url-key`에 `{ "apiKey": "..." }`를 전달한다. 빈 값은 거부하고, 성공 시 입력을 지우며 공통 Toast로 알린다.
- 기존 비공개 `admin-settings` Storage 버킷의 `short-url-api-key.json`에 AES-256-GCM 암호문을 저장한다. 브라우저에는 해당 버킷 접근 권한이 없다. 스키마 마이그레이션은 필요하지 않다.
- 암호화 키는 기존 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로부터 용도를 구분하여 파생한다. 서버 키를 교체하면 이 API 키도 다시 등록해야 한다.
- 서버 전용 `loadShortUrlApiKey()`를 사용한다. 키나 요청 본문을 로그에 기록하지 않는다. 전달 문서의 서버 환경변수 예시 대신 기존 암호화 키 저장소를 유지하며 브라우저에 키를 노출하지 않는다.
- 화면은 `src/lib/short-links/browser.ts`의 `issueCourseShortLink({ course_id, type_key, destination_url, name })`를 호출한다. 공통 함수가 내부 API 요청·응답 검증을 맡고 화면은 필드 반영과 Toast만 처리한다.
- 서버 전용 `src/lib/short-links/client.ts`의 `createShortLink()`가 저장된 키로 유형 목록을 조회한 후 `POST https://bizup.im/api/v1/short-links`를 호출한다. 조회 실패·잘못된 목록·미등록 유형이면 발급하지 않는다. 비활성 유형의 기존 주소는 사용할 수 있으므로 해당 유형은 서버가 409 또는 422로 판단한다. 요청마다 리다이렉트 차단, no-store, 15초 타임아웃을 적용한다.
- 로그인한 강의 운영 사용자는 `POST /api/course-operations/{courseId}/short-links`에 `{ "type_key": "payment", "destination_url": "https://example.com/payment", "name": "결제 안내" }`를 보낼 수 있다. 강의 UUID와 워크스페이스 권한을 확인한다. 숫자 type 및 예상하지 않은 필드는 거부한다.
- 외부 응답 201은 `{ short_url, existing: false }`와 HTTP 201, 409 `LINK_TYPE_EXISTS`는 기존 `error.details.short_url`을 이용해 `{ short_url, existing: true }`와 HTTP 200으로 반환한다. 다른 오류와 비정상 응답은 키나 외부 원문을 노출하지 않는 안내로 처리한다.
- 이 API는 발급된 주소를 반환하며 강의 링크 필드 자체는 변경하지 않는다.
- 기본 랜딩 QR은 `type_key: "landing"`과 기본 랜딩페이지 입력값을 사용한다. 결제페이지 QR은 `type_key: "payment"`와 기본 결제페이지 입력값을 사용한다. 발급 결과는 해당 QR 입력창에 넣고 강의 저장 버튼으로 저장한다. 다른 필드의 미저장 입력은 유지하고 발급 중 중복 클릭과 강의 저장을 막는다.
- 전환 근거: `docs/dashboard-short-link-type-key-handoff.md`, 공식 명세 `https://bizup.im/openapi.yaml` (2.0.0). 원본 페이지 URL과 다른 서비스의 QR은 정리 대상이 아니다. 삭제된 bizup.im 주소는 404 확인 후 해당 값만 조건부로 비운다.
- 2026-11-26 전환 시 공용 워크스페이스에서 기존 bizup.im QR 1건의 404를 확인하여 해당 기본 랜딩 QR 값만 비웠고, DB 재조회로 확인했다. 스키마 변경은 없다.

## 사후 세일즈 자동 연결

- `POST_SALES_SHORT_LINK_TYPE.typeKey = "aftersales"`. 공개 주소가 있는 사후 세일즈를 저장·공개할 때 `syncPostSalesShortLink()`가 공통 `createShortLink()`를 호출하고 결과를 해당 강의의 `free_gift_link`에 저장한다. 홍보컨텐츠의 사후 세일즈 링크에 표시된다.
- 첫 미공개 초안은 공개 주소가 없어 발급하지 않는다. 최초 외부공개부터 자동 연결하며, 이후 초안·이미지 저장도 실패했던 링크 연결을 재시도한다.
- 페이지 저장 RPC는 원본 주소로 강의 링크를 덮어쓰지 않는다. 발급·연결 실패 시 본문과 최신 revision은 정상 반환하고 `shortLinkWarning`을 공통 Toast로 표시한다. 기존 강의 링크는 그대로 유지한다.
- `aftersales`가 서버에 미등록이면 임의로 생성하거나 대체하지 않고 공통 함수의 유형 확인 오류를 안내한다.
