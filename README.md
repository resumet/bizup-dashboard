# BizUp 서비스 대시보드

비즈업 운영 서비스들을 카드형 플러그인으로 제공하고, 첫 번째 서비스로 수강생 명단 분석을 구현하는 Next.js 애플리케이션입니다.

## 로컬 실행

```powershell
npm install
Copy-Item .env.example .env.local
npm run dev
```

Supabase 없이도 현재 대시보드와 가져오기 진입 UI를 확인할 수 있습니다. 실제 인증과 데이터 저장을 연결하려면 `.env.local`에 Supabase 값을 입력하고 `supabase/migrations`의 SQL을 적용하세요.

## Supabase 초기 설정

1. Supabase Dashboard에서 프로젝트의 **SQL Editor → New query**를 엽니다.
2. `supabase/migrations/202608260001_foundation.sql` 전체를 붙여 넣고 **Run**을 실행합니다.
3. `/login`에서 첫 계정을 생성합니다. 마이그레이션의 Auth 트리거가 이 계정의 워크스페이스와 관리자 멤버십을 자동 생성합니다.
4. `/services/course-roster/new`에서 CSV를 검증한 뒤 **명단 저장**을 누릅니다.

`course-files` 버킷은 private이며 20MB CSV만 허용합니다. 저장 API는 로그인 세션과 워크스페이스 멤버십을 검증한 뒤 원본 파일, 작업, 파일 버전 및 감사 로그를 기록합니다.

## 현재 구현 범위

- 서비스 대시보드와 상태별 실행 제어 UI
- 수강생 명단 작업 목록과 UTF-8 CSV 업로드
- 샘플 형식 자동 컬럼 매핑, 전화번호 정규화, 오류·중복 검증, 마스킹 미리보기
- Supabase 브라우저/서버 클라이언트 기반
- 이메일 로그인/계정 생성과 서버 세션 갱신
- 워크스페이스, 역할, 서비스, 작업, 파일 버전, 학생, 신청, 오류, 감사 로그 스키마와 RLS
- Supabase private Storage 원본 저장과 실패 시 보상 삭제
- Shoong 서버 비밀값 환경변수 계약

## 지원하는 1차 입력 형식

현재 `강의명, 옵션명, 이름, 이메일, 연락처, RS 추천인, 유입 경로, 광고 매체` 구조의 UTF-8 CSV를 지원합니다. 최대 크기는 20MB이며, 원본을 저장하기 전에 서버에서 검증 미리보기를 생성합니다.

제품 전체 요구사항은 `docs/BizUp_Service_Dashboard_PRD_v1.0.md`를 기준으로 합니다.

## Vercel 유튜브 다운로드 도구 배포

Vercel Function은 영상 파일을 직접 응답하지 않습니다. `youtube-worker` 컨테이너를 별도로 배포한 뒤 Vercel에 `YOUTUBE_DOWNLOAD_WORKER_URL`, `YOUTUBE_DOWNLOAD_WORKER_TOKEN`을 설정하세요. 자세한 설정은 `youtube-worker/README.md`를 확인합니다.
