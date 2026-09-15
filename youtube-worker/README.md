# YouTube 다운로드

## Vercel 기본 실행

GitHub와 연결된 기존 Vercel 프로젝트에서 실행합니다. `YOUTUBE_DOWNLOAD_WORKER_URL`과 `YOUTUBE_DOWNLOAD_WORKER_TOKEN`이 없으면 `@vercel/sandbox`가 임시 실행 환경을 생성합니다. 별도 Docker 호스팅은 필요하지 않습니다.

Vercel 배포에서는 프로젝트 OIDC 인증을 사용합니다. 프로젝트에서 OIDC를 비활성화한 경우 Vercel의 프로젝트 보안 설정을 확인해야 합니다. Sandbox 사용 한도도 적용됩니다. Hobby는 제공 한도 내 사용하며, 유료 요금제는 포함량 초과 시 사용량 과금이 적용될 수 있습니다.

- 영상 확인: 임시 환경에서 yt-dlp로 정보를 조회하고 환경을 즉시 삭제합니다.
- 다운로드: 임시 환경에서 백그라운드로 파일을 준비합니다. 브라우저가 서명된 상태 URL을 조회하다가 준비가 끝나면 파일을 직접 받습니다. 대용량 영상이 Vercel Function 응답을 통과하지 않습니다.
- 상태/파일 URL은 20분 동안 유효하며 한 환경에서 영상 하나만 처리합니다. 파일 전송 후 임시 파일을 삭제합니다.
- 실행 환경은 최대 25분 후 종료하며 파일시스템 스냅샷을 보존하지 않습니다. 준비 실패 시 즉시 삭제합니다.
- 로그인 사용자만 환경을 생성할 수 있습니다. 워커 인증키와 다운로드 서명키는 요청마다 새로 생성하고 브라우저에는 전달하지 않습니다.
- 공개 영상, 최대 500MB만 지원합니다. YouTube의 데이터센터 IP 제한이나 영상별 접근 제한이 있으면 오류가 표시됩니다. 쿠키 또는 접근 제한 우회는 지원하지 않습니다.

배포 후 로그인하여 **영상 확인 → 권한 확인 → 영상 다운로드**를 실행합니다. 처음 환경을 준비할 때 시간이 걸릴 수 있습니다. 개발 PC에서는 기존 로컬 `yt-dlp`와 `ffmpeg`를 사용합니다.

검증:

```powershell
node_modules/.bin/tsx.cmd --conditions=react-server --test src/lib/tools/youtube-download.test.ts src/lib/tools/youtube-download-worker.test.ts src/lib/tools/youtube-download-sandbox.test.ts
python -m unittest discover -s youtube-worker -p test_sandbox.py
```

Python 테스트에는 FastAPI, httpx, yt-dlp가 필요합니다. 테스트는 실제 YouTube 접속 없이 인증, 만료, 백그라운드 상태, 파일 전송과 삭제를 검증합니다. SDK 테스트는 Sandbox를 모의 처리하므로 운영 OIDC와 YouTube 접근 검증을 대신하지 않습니다.

공식 문서: [Sandbox 인증](https://vercel.com/docs/sandbox/concepts/authentication), [SDK](https://vercel.com/docs/sandbox/sdk-reference), [요금 및 한도](https://vercel.com/docs/sandbox/pricing).

## 선택 사항: 외부 Docker 워커

별도 워커를 이미 운영한다면 기존 연결도 사용할 수 있습니다. `youtube-worker/Dockerfile`을 배포하고 포트 8080(또는 `PORT`), 상태 확인 경로 `/health`를 사용합니다.

워커 환경변수:

- `WORKER_API_TOKEN`: Vercel API와 워커 간 Bearer 토큰
- `DOWNLOAD_SIGNING_SECRET`: 무작위 다운로드 URL 서명키
- `PUBLIC_BASE_URL`: HTTPS 공개 주소

Vercel 환경변수:

- `YOUTUBE_DOWNLOAD_WORKER_URL`: 위의 `PUBLIC_BASE_URL`
- `YOUTUBE_DOWNLOAD_WORKER_TOKEN`: 위의 `WORKER_API_TOKEN`

두 값이 설정되어 있으면 외부 워커를 우선 사용합니다. 한 값만 있으면 설정 오류가 표시됩니다. 로컬 `.env.local`에 설정한 뒤 다음 명령으로 실제 영상 다운로드 없이 서버 상태와 인증을 진단할 수 있습니다.

```powershell
node_modules/.bin/tsx.cmd --conditions=react-server scripts/verify-youtube-worker.ts
```
