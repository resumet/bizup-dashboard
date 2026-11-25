# 짧은 주소 발급 API 키

- 관리자 설정(`/admin`)의 **짧은 주소 발급 API 키**에서 등록·교체한다.
- 관리자 설정 페이지와 동일하게 최고관리자 이메일 또는 `workspace_members.role = super_admin`인 계정만 조회·저장할 수 있다.
- `GET /api/admin/short-url-key`는 `configured`, `updatedAt`만 반환한다. 원문과 암호문은 반환하지 않는다.
- `PUT /api/admin/short-url-key`에 `{ "apiKey": "..." }`를 전달한다. 빈 값은 거부하고, 성공 시 입력을 지우며 공통 Toast로 알린다.
- 기존 비공개 `admin-settings` Storage 버킷의 `short-url-api-key.json`에 AES-256-GCM 암호문을 저장한다. 브라우저에는 해당 버킷 접근 권한이 없다. 스키마 마이그레이션은 필요하지 않다.
- 암호화 키는 기존 서버 전용 `SUPABASE_SERVICE_ROLE_KEY`로부터 용도를 구분하여 파생한다. 서버 키를 교체하면 이 API 키도 다시 등록해야 한다.
- 추후 발급 연동에서는 서버 전용 `loadShortUrlApiKey()`를 사용한다. 키나 요청 본문을 로그에 기록하지 않는다.
- 현재 범위는 키 보관이며, 발급 서비스 호출·유효성 확인·단축 주소 생성은 포함하지 않는다.
