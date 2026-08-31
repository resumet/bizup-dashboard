# YouTube download worker

Vercel Function의 4.5MB 응답 크기 제한을 피하기 위한 별도 컨테이너입니다. Cloud Run, Railway, Fly.io 등 Docker를 실행할 수 있는 환경에 배포합니다.

## 필수 환경변수

- `WORKER_API_TOKEN`: Vercel API와 워커 간 Bearer 토큰
- `DOWNLOAD_SIGNING_SECRET`: 최소 32바이트의 다운로드 URL 서명키
- `PUBLIC_BASE_URL`: HTTPS 워커 공개 주소

Vercel 프로젝트에는 다음을 설정합니다.

- `YOUTUBE_DOWNLOAD_WORKER_URL`: `PUBLIC_BASE_URL`과 같은 값
- `YOUTUBE_DOWNLOAD_WORKER_TOKEN`: `WORKER_API_TOKEN`과 같은 값

워커는 공개 단일 영상만 처리하며 로그인 쿠키, DRM 우회, 멤버십·비공개 영상 접근을 지원하지 않습니다.
