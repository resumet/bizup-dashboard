# Supabase 초대와 비밀번호 설정

## 조사 결과와 구현 계획

2026-10-08 기준 Next.js 16.3.3 App Router (`src/app`, TypeScript), `@supabase/ssr` 0.12.5, `@supabase/supabase-js` 2.112.4를 사용한다. 연결된 프로젝트는 `bizup-dashboard` (`ymezcbzdxhjepbkzooni`), 운영 주소는 `https://bizup-dashboard.vercel.app`이다.

기존 초대 발송 API, 인증 콜백, 비밀번호 설정·재설정 화면은 소스에 없었다. 일반 로그인 폼은 제출할 때만 브라우저 Supabase 클라이언트를 생성한다. `/` 및 보호된 레이아웃은 서버 `getUser()` 검사 후 세션이 없으면 `/login`으로 이동한다. Proxy는 `getClaims()`로 쿠키를 갱신할 뿐 페이지 접근을 막지 않는다.

Supabase 기본 `ConfirmationURL` 링크는 인증 후 세션을 URL fragment (`#` 이후)에 전달한다. fragment는 서버로 전송되지 않으므로 기존 서버 인증 검사에서 세션을 얻을 수 없고, 클라이언트가 초대를 받아 비밀번호 설정으로 연결하는 코드도 없었다. 이는 소스에서 확인한 결함이다. 실제 발송 메일의 링크와 Dashboard의 설정값은 이번 작업에서 확인하지 못했으므로, 해당 메일의 정확한 리다이렉트 설정까지 확정한 것은 아니다.

읽기 전용 DB 집계에서는 초대 이력이 있는 계정 2개가 모두 이메일 확인과 비밀번호를 보유하고 있었다. 진행 중인 미수락 초대가 없었으므로 실제 사용자 링크를 소비하거나 사용자 비밀번호를 변경하는 재현은 하지 않았다.

후속 확인에서 조직의 **Free 플랜**과 프로젝트 생성일 **2026-08-26**을 확인했다. Supabase는 2026-06-03 이후 생성된 Free 프로젝트가 기본 SMTP를 사용할 때 인증 메일 템플릿 편집을 금지한다. SMTP 설정 자체는 조회하지 못했다. 사용자가 템플릿을 편집할 수 없다고 알려 주었으므로, 템플릿 변경을 전제로 한 기존 계획을 수정했다. 현재 기본 메일 지원에는 Custom SMTP나 유료 플랜 전환이 필요하지 않다.

구현 순서는 기본 초대 fragment 수신 → 브라우저에서 Supabase 서버 검증 및 SSR 쿠키 저장 → 서버 인증 비밀번호 설정 화면 → 오류 처리 → 회귀 검증이다. 기존 `token_hash` 서버 콜백도 호환성을 위해 남겨 둔다.

## 구현한 흐름

1. 기존 기본 메일의 `ConfirmationURL`을 그대로 연다. Supabase가 초대를 검증하고 Site URL 또는 허용된 `redirect_to` 주소로 `#access_token=…&refresh_token=…&type=invite`를 전달한다.
2. 루트 레이아웃의 정적 `beforeInteractive` 스크립트가 초대 fragment를 `/auth/callback`으로 전달한다. 홈·로그인 화면 및 기존 계정이 로그인된 경우에도 처리한다. 서버에는 fragment가 전달되지 않는다. 일반 anchor와 `recovery`·`magiclink` 성공 fragment는 건드리지 않는다. 타입 없이 전달되는 Auth 오류 fragment는 원본 메시지를 제거하고 안전한 오류 화면으로 보낸다.
3. 공개 `/auth/callback`은 토큰을 메모리에만 읽고 주소창의 fragment와 쿼리를 즉시 제거한다. Supabase SDK 생성 전에 제거하므로 PKCE 자동 감지와 충돌하지 않는다. `getUser(access_token)`로 실제 서버의 계정 상태를 확인한 후 `setSession()`을 사용해 기존 SSR 쿠키 저장소에 초대 세션을 저장한다. 다시 `getUser()`로 현재 계정을 검증하고 고정 경로 `/set-password`로 전체 페이지 이동한다. 잘못된 토큰과 사전에 비활성이 확인된 계정은 기존 로그인 세션을 교체하지 않는다. 저장 직후 비활성 상태가 확인되면 해당 새 세션을 로컬 로그아웃한다. 네트워크 오류는 URL에 토큰을 다시 넣지 않고 메모리의 토큰으로 재시도할 수 있다. 새로고침하면 메모리의 토큰은 사라지므로 메일 링크를 다시 열어야 하며, 이미 사용된 경우 새 초대가 필요하다.
4. `/set-password`의 서버 `getAuthenticatedUser()`가 유효한 활성 계정인지 다시 확인한다. 세션이 없으면 `/auth/invite-error?reason=session`으로 이동한다.
5. 새 비밀번호와 확인 입력을 검증하고 브라우저 `getUser()`로 현재 계정이 페이지에 표시한 계정과 같은지 확인한다. `updateUser({ password })` 성공 시 세션을 유지한 채 기존 홈 `/`로 이동한다.

`/set-password`는 활성 상태로 인증된 사용자가 자신의 비밀번호를 설정할 수 있는 페이지다. 초대된 사용자만을 구분하는 별도 완료 플래그나 DB 스키마를 추가하지 않았다. 기존 계정의 비밀번호를 강제 변경하지 않으며, 다른 계정이나 역할·RLS를 변경하지 않는다. 이 페이지의 재방문은 인증된 사용자의 자기 비밀번호 변경을 허용한다.

인증 관련 새 경로에는 `no-store`, `no-referrer`, `noindex` 헤더를 적용한다. Supabase SSR이 쿠키 갱신 시 전달하는 캐시 방지 헤더도 Proxy에서 유지한다. 원본 오류, 초대 토큰, 비밀번호, 세션을 코드에서 로그로 출력하지 않는다. 기본 초대의 세션 토큰을 애플리케이션 HTTP 쿼리, localStorage 또는 sessionStorage로 옮기지 않는다. 실제 세션은 기존 SSR 클라이언트가 쿠키에 저장한다. 임의의 `next`·외부 이동 인자를 사용하지 않는다. 역할·RLS·보호 화면의 접근 검사는 그대로 유지한다.

선택적 기존 `/auth/confirm?token_hash=…&type=invite` 경로는 서버 `verifyOtp()`와 응답에 연결된 모든 분할·삭제 쿠키를 유지한다. 고정 상대 `Location`을 사용하고 기존 테스트를 유지한다. **기본 메일을 사용할 때 이 경로의 설정은 필요하지 않다.** 선택적 쿼리 토큰은 호스팅 요청 로그에 들어갈 수 있으므로 원본 초대 URL을 공유하거나 분석 이벤트로 수집하지 않는다.

## 변경 파일

| 파일 | 변경 이유 |
|---|---|
| `src/app/layout.tsx`, `src/lib/supabase/invite-redirect-script.ts` | 기본 초대를 hydration 전에 공개 콜백으로 전달 |
| `src/app/auth/callback/page.tsx`, `src/components/auth/invite-callback.tsx` | 기본 fragment 수신, URL 정리, 연결 오류 재시도와 SSR 페이지 이동 |
| `src/lib/supabase/invite-session.ts`, `invite-session.test.ts` | 기본 초대 계정 서버 검증·세션 쿠키 저장 및 분할 쿠키 회귀 검증 |
| `src/app/auth/confirm/route.ts` | 선택적 사용자 정의 템플릿용 서버 콜백 유지 |
| `src/lib/supabase/invite-confirmation.ts`, `invite-confirmation.test.ts` | invite 토큰 검증, 고정 이동 경로, 오류 분기와 SSR 쿠키 검증 |
| `src/lib/supabase/route-client.ts` | 반환 응답에 세션 쿠키와 캐시 방지 헤더 연결 |
| `src/app/set-password/page.tsx` | 서버 수준 계정·세션 검사와 비밀번호 정책 전달 |
| `src/components/auth/set-password-form.tsx` | 비밀번호·확인 입력, 오류, 제출 잠금, 저장 후 홈 이동 |
| `src/lib/supabase/password-setup.ts`, `password-setup.test.ts` | 입력·현재 계정 검증, 비밀번호 저장, 정책 오류와 재시도 검증 |
| `src/app/auth/invite-error/page.tsx` | 만료·재사용·세션 없음·계정 비활성 안내 |
| `src/lib/supabase/proxy.ts` | 세션 갱신 시 SSR 라이브러리가 요구하는 응답 헤더 유지 |
| `next.config.ts`, `.env.example` | 인증 경로의 캐시·referrer·검색 차단과 비밀번호 최소 길이 설정 |
| `scripts/verify-invite-auth.mjs`, `scripts/fixtures/invite-auth-fetch.mjs` | 운영 계정을 변경하지 않는 로컬 브라우저 검증 |
| `docs/supabase-invite-password-setup.md` | 조사, 계획, 설정, 검증 결과 및 실제 메일 테스트 절차 |

## 운영자가 설정할 항목

**Invite user 템플릿은 변경하지 않는다.** 기존 기본 `ConfirmationURL`을 그대로 사용한다. 아래 URL 설정이 이미 맞다면 Dashboard를 변경할 필요가 없다. 코드 구현 단계에서는 원격 설정·사용자·DB·메일 발송을 변경하지 않았다. 실제 메일 검증 단계에서는 운영자에게 지정받은 미사용 이메일로만 초대를 발송하며 기존 계정을 삭제하거나 비밀번호를 변경하지 않는다.

### Site URL

[Authentication → URL Configuration](https://supabase.com/dashboard/project/ymezcbzdxhjepbkzooni/auth/url-configuration)에서 Site URL을 확인한다.

```text
https://bizup-dashboard.vercel.app
```

Site URL은 위 운영 origin을 권장한다. 현재 Site URL이 같은 사이트의 `/login`이라도 초대 fragment를 처리할 수 있으므로 콜백을 위해 경로를 강제로 변경할 필요는 없다. 다른 사이트·localhost로 설정되어 있으면 운영 origin으로 수정해야 한다. `/set-password`는 서버 인증을 요구하므로 기본 초대의 직접 도착 주소로 사용하지 않는다.

### Redirect URLs

Dashboard의 기본 초대가 Site URL로 돌아오는 경우 별도 콜백 주소를 추가할 필요가 없다. 기존 허용 URL은 유지한다. 향후 서버 초대 API의 `redirectTo`를 공개 콜백으로 지정하거나 개발 환경을 테스트하는 경우에만 해당 주소를 정확히 허용한다.

```text
https://bizup-dashboard.vercel.app/auth/callback
http://localhost:3000/auth/callback
```

개발 URL은 개발 테스트에 필요한 경우만 추가한다. 별도 preview는 실제 사용하는 도메인별 허용 주소를 등록한다. 허용 URL 추가만으로 Dashboard 초대의 기본 도착 주소가 바뀌는 것은 아니다.

현재 소스에는 `inviteUserByEmail` 호출이 없다. 향후 서버 초대 기능을 만들면 기본 템플릿을 유지하고 허용된 `/auth/callback`을 `redirectTo`로 사용할 수 있다. 관리자 권한 API는 서버 전용으로 유지해야 한다.

### Invite user 이메일 템플릿

[Authentication → Email Templates](https://supabase.com/dashboard/project/ymezcbzdxhjepbkzooni/auth/templates)의 **Invite user**는 편집하지 않는다. Free 플랜·기본 SMTP의 템플릿 편집 제한을 우회하는 Management API 요청도 하지 않는다.

이미 발송된 기본 메일도 올바른 배포 도메인으로 돌아오고 **아직 유효·미사용**이면 처리할 수 있다. 이미 사용·만료된 초대는 새 초대가 필요하다. 이미 이메일 인증을 완료한 계정은 Supabase의 초대 재발송 조건에 걸릴 수 있다. 계정 상태를 먼저 확인하고 계정을 삭제해 재초대하는 방식은 사용하지 않는다. 기존 계정의 비밀번호 복구 기능은 이 작업에 추가하지 않았으며 필요하면 별도 recovery 흐름을 구현해야 한다.

### 비밀번호 정책

Supabase Auth의 실제 **Minimum password length**와 서버 환경변수 `SUPABASE_PASSWORD_MIN_LENGTH`를 동일하게 맞춘다. 환경변수 미설정 시 기존 로그인 폼과 동일한 6자를 최소 검사로 사용한다. 조합 조건과 유출 비밀번호 검사는 Supabase가 최종 판정하며, 정책 위반 시 폼에 한국어 안내를 표시한다. 서버 환경변수에는 비밀번호나 토큰을 넣지 않는다.

### 메일 스캐너와 링크 추적

기본 메일 링크는 Supabase의 GET 검증 단계에서 일회용 토큰을 소비한다. 사이트의 콜백을 변경해도 이 동작은 바뀌지 않는다. 메일 보안 스캐너가 실제 인증 링크를 미리 방문하면 만료·사용 완료 오류가 생길 수 있다. 이런 현상은 별도 메일/OTP 설계가 필요하며 무료 기본 메일만으로 해결했다고 간주하지 않는다. 메일 공급자의 링크 추적이나 메일 앱의 브라우저가 fragment를 보존하는지도 실제 메일 테스트로 확인한다. JavaScript가 비활성화된 브라우저에서는 기본 fragment 인증을 완료할 수 없다.

## 검증

자동 검증은 Supabase Auth 응답을 모의 처리하며 실제 운영 사용자를 만들거나 메일을 발송하지 않는다. 실제 SSR 라이브러리를 사용하는 콜백 테스트는 반환된 분할 쿠키를 다음 서버 요청에 전달해 동일한 계정의 `getUser()` 인증이 유지되는지 확인한다.

```powershell
npx.cmd tsx --conditions=react-server --test src/lib/supabase/auth.test.ts src/lib/supabase/invite-confirmation.test.ts src/lib/supabase/invite-session.test.ts src/lib/supabase/password-setup.test.ts
npm.cmd run lint
npm.cmd run lint -- src scripts/verify-invite-auth.mjs scripts/fixtures/invite-auth-fetch.mjs next.config.ts
npx.cmd tsc --noEmit
npm.cmd run build
```

브라우저 검증 스크립트는 프로덕션 빌드를 사용하고 서버·브라우저의 Supabase 요청을 로컬 모의 인증 서버로 전달한다. 운영 DB와 계정에는 접근하거나 쓰지 않는다. Playwright가 로컬에서 설치되어 있으면 다음 명령을 사용한다. 다른 위치의 기존 Playwright를 사용할 때는 `--playwright-module`에 해당 패키지의 `index.mjs` 절대 경로를 전달한다.

```powershell
node scripts/verify-invite-auth.mjs
```

기본 메일 지원 후 초대·비밀번호 관련 단위 테스트 **18건 통과**, TypeScript 검사와 프로덕션 빌드 통과, 소스·검증 스크립트 린트 오류 0건(기존 경고 2건). 최초 구현 당시 기존 WBS UI 테스트 6건 통과. 최초 구현의 전체 라이브러리 테스트는 513건 중 506건 통과, 3건 건너뜀, 4건 실패했다. 실패한 파일은 이번 작업에서 변경하지 않았고 후속 수정에서 전체 라이브러리 테스트를 다시 실행하지 않았다.

후속 수정의 프로덕션 빌드 브라우저 검증은 **21건 모두 통과**했다. 기본 `ConfirmationURL`의 GET → fragment 리다이렉트를 모의 재현하며, 비인증 접근 차단·기존 로그인·다른 계정에서 초대 계정으로 전환·비밀번호 입력/정책/중복 제출·새 비밀번호로 재로그인·기본 초대 재사용 오류·비로그인 홈/로그인 도착·로그인 상태의 로그인→홈 리다이렉트·직접 콜백·토큰 없는 콜백 거절·토큰 전달 보안·변조 링크·네트워크 재시도·비활성 계정·선택적 기존 콜백 호환성을 확인했다. 모의 Auth 서버이므로 실제 초대 메일·운영 설정 확인을 대신하지 않는다.

2026-10-08 배포 전 재검증에서 단위 테스트 18건, 모의 브라우저 검증 21건, 소스 린트(오류 0·기존 경고 2), 프로덕션 빌드가 다시 통과했다. 운영 Supabase와 로컬의 활성 마이그레이션 21개가 모두 일치하며 적용할 신규 마이그레이션은 없다. DB 스키마와 마이그레이션 변경은 없다. 운영 배포는 이 소스를 `main`에 커밋하고 `origin/main`으로 푸시하는 Git 통합 경로를 사용한다. 커밋별 배포 상태는 Vercel에서 확인하고 실제 메일 검증 결과는 배포 완료 보고에 구분해 기록한다.

- `course-detail-heading.test.ts`: 현재 실행 환경의 한국어 `Intl.DateTimeFormat`이 오전/오후 대신 AM/PM을 출력하는 차이로 3건 실패.
- `instructor-intake/database.test.ts`: 존재하지 않는 `20261005050000_instructor_intake_course.sql` 참조로 1건 실패.
- 기본 `npm run lint`는 기존 `.cache`, `tmp` 및 생성 번들까지 포함해 실패한다. 소스와 새 검증 스크립트로 범위를 지정한 검사에는 오류가 없다.

기존 전체 테스트 중 React 렌더링 테스트는 `react-server` 조건과 함께 실행할 수 없다. 서버 라이브러리 테스트와 UI 테스트를 나누어 실행한다.

실제 메일 E2E와 Dashboard 설정 정합성은 자동 모의 테스트로 대체하지 않는다. 배포 후 아래 절차로 확인한다.

1. 미사용 테스트 이메일에 새 초대를 발송하고 시크릿 창에서 링크를 연다.
2. 최종 주소에 토큰이 남지 않고 `/set-password`와 해당 이메일이 표시되는지 확인한다.
3. 짧은 비밀번호, 불일치 입력, 보안 정책 위반을 확인한다.
4. 정상 비밀번호 저장 후 별도 로그인 없이 `/`에 진입하는지 확인한다.
5. 로그아웃 후 설정한 비밀번호로 로그인한다.
6. 기존 계정의 로그인·로그아웃과 역할별 화면 접근을 확인한다.
7. 변조·누락·만료·재사용 링크와 비인증 상태의 `/set-password` 접근에서 안전한 안내가 표시되는지 확인한다.
8. 다른 계정으로 로그인되어 있던 브라우저에서도 새 초대 계정의 이메일이 표시되는지 확인한다.

## 공식 참고

- [Supabase 이메일 템플릿과 SSR·스캐너 주의사항](https://supabase.com/docs/guides/auth/auth-email-templates)
- [Free 플랜의 이메일 템플릿 편집 제한](https://supabase.com/changelog/46599-changes-to-email-template-customisation-on-free-tier)
- [Implicit flow와 URL fragment](https://supabase.com/docs/guides/auth/sessions/implicit-flow)
- [setSession](https://supabase.com/docs/reference/javascript/auth-setsession)
- [Supabase SSR 클라이언트](https://supabase.com/docs/guides/auth/server-side/creating-a-client)
- [허용 Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
- [비밀번호 보안 정책](https://supabase.com/docs/guides/auth/password-security)
- [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser)
