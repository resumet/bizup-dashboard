# 짧은 주소 발급 API 키

- 관리자 설정(`/admin`)의 **짧은 주소 발급 API 키**에서 등록·교체한다.
- 관리자 설정 페이지와 동일하게 최고관리자 이메일 또는 `workspace_members.role = super_admin`인 계정만 조회·저장할 수 있다.
- `GET /api/admin/short-url-key`는 `configured`, `updatedAt`만 반환한다. 원문과 암호문은 반환하지 않는다.
- `PUT /api/admin/short-url-key`에 `{ "apiKey": "..." }`를 전달한다. 빈 값은 거부하고, 성공 시 입력을 지우며 공통 Toast로 알린다.
- 기존 비공개 `admin-settings` Storage 버킷의 `short-url-api-key.json`에 AES-256-GCM 암호문을 저장한다. 브라우저에는 해당 버킷 접근 권한이 없다. 스키마 마이그레이션은 필요하지 않다.
- 암호화 키는 기존 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로부터 용도를 구분하여 파생한다. 서버 키를 교체하면 이 API 키도 다시 등록해야 한다.
- 추후 발급 연동에서는 서버 전용 `loadShortUrlApiKey()`를 사용한다. 키나 요청 본문을 로그에 기록하지 않는다.
- 서버 전용 `src/lib/short-links/client.ts`의 `createShortLink()`가 저장된 키로 `POST https://bizup.im/api/v1/short-links`를 호출한다. 리다이렉트를 따르지 않으며 15초 타임아웃을 사용한다.
- 로그인한 강의 운영 사용자는 `POST /api/course-operations/{courseId}/short-links`에 `{ "type": "0001", "destination_url": "https://example.com/landing", "name": "강의 안내" }`를 보낼 수 있다. 경로의 UUID와 사용자의 워크스페이스 소속 강의를 확인하고 외부 API의 `course_id`로 전달한다. `0001`은 요청 형식 예시이며 용도별 타입 배정은 별도다.
- 외부 응답 201은 `{ short_url, existing: false }`와 HTTP 201, 409 `LINK_TYPE_EXISTS`는 기존 `error.details.short_url`을 이용해 `{ short_url, existing: true }`와 HTTP 200으로 반환한다. 다른 오류와 비정상 응답은 키나 외부 원문을 노출하지 않는 안내로 처리한다.
- 이 API는 발급된 주소를 반환하며 강의 링크 필드 자체는 변경하지 않는다.
- 강의 상세의 기본 랜딩 QR 옆 **발급** 버튼은 현재 강의 UUID, `type: "0000"`, 기본 랜딩페이지 입력값, 강의명 기반 이름으로 호출한다. 성공 또는 409의 기존 주소를 QR 입력창에 넣는다. 강의 저장 버튼으로 이 값을 저장한다. 다른 필드의 미저장 입력은 유지한다.
