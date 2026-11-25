<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## UI copy rules

- Unless the user explicitly requests another order, every course list and course selection dropdown must use the shared `sortByNearestWebinar` policy: upcoming webinars first from the nearest date, followed by past webinars from the most recent date, with missing/invalid dates last. Use the Asia/Seoul calendar date. Apply this within status groups and preserve the order while filtering/searching; do not replace it with creation/update time or descending webinar date.

- Unless the user explicitly requests otherwise, course selection dropdowns must exclude courses with status `on_hold` (보류), `completed` (완료), or `canceled` (취소). Use the shared course-status selection policy. Preserve existing saved course associations and their display; filtering choices must not erase historical data.

- Exception: the cash ledger entry form must list all course statuses, including on-hold, completed, and canceled courses, with labels `(상태)강사명-강의명-기수`.

- Page and section titles must stand on their own. Do not add explanatory subtitles, eyebrow labels, or descriptive badges directly above or below a title.
- Put necessary guidance only where users act on it, such as field help, validation, empty states, or error messages.
- In list and table views, when an item title already links to its detail screen, do not add a separate management/action column or open button for the same navigation.

## 작업 결과 알림 공통 규칙

- 페이지 정보를 저장·수정·삭제·등록·가져오기 등으로 업데이트한 결과는 반드시 `src/components/ui/toast.tsx`의 공통 Toast를 사용한다. 새 상단 성공 배너, 인라인 성공 문구, `window.alert`, 화면별 Toast 구현을 만들지 않는다.
- 이벤트 핸들러에서 서버 성공을 확인한 뒤 `toast("저장했습니다.")`를 호출한다. 실패는 `toast(message, { tone: "error" })`, 안내는 `{ tone: "info" }`를 사용한다. 화면 이동이나 팝업 닫기 전에 호출한다. 렌더링 중에는 호출하지 않는다.
- 기존 상태 기반 알림은 `<ToastNotice message={notice} onDismiss={() => setNotice("")} />`로 연결한다. 동일한 문구의 연속 이벤트는 `eventKey`를 변경하거나 이벤트 핸들러에서 `toast()`를 직접 호출한다.
- `ToastProvider`는 루트 레이아웃에 한 번만 둔다. 토스트는 하단 중앙, 성공·안내 4초/오류 8초 자동 닫힘, 수동 닫기, 포커스·마우스 진입 시 일시정지, 스크린리더 알림을 공통으로 제공한다. 페이지별 위치·타이머·Portal을 추가하지 않는다.
- 입력 필드 검증, 최초 조회 실패와 재시도, 진행 상태, 삭제 확인 대화상자, 지속적으로 확인해야 하는 업무 데이터는 해당 위치에 유지한다. 저장·삭제 결과 알림과 혼동하지 않는다.

## Short-link type registry

- 짧은 주소 유형의 기준은 BZUP Link 서버의 `GET /api/v1/short-link-types`다. 서버 전용 `src/lib/short-links/client.ts`의 `listShortLinkTypes()`로 조회한다. 숫자 `type`과 호환 매핑은 사용하지 않는다.
- 새 type_key 생성·추가 요청을 받으면 구현 전에 반드시 서버 목록과 `src/lib/short-links/types.ts`의 화면 연결 목록을 확인한다. 이미 등록된 key면 기존 용도를 사용자에게 먼저 알리고, 다른 용도로 재배정하지 않는다. 목록 조회 실패 시 임의의 key를 만들지 않는다. 새 유형은 BZUP Link 운영자에게 등록을 요청한다.
- 현재 화면 연결: `landing` = 기본 랜딩 QR (`landingPageLink` → `landingPageQrLink`), `payment` = 결제페이지 QR (`basicPaymentPageLink` → `paymentLink`). 화면 연결은 `SHORT_LINK_TYPES`에서 관리한다.
- 화면은 공통 `src/lib/short-links/browser.ts`의 `issueCourseShortLink()`를 호출한다. 외부 API 인증·유형 조회·발급·409 처리·오류 변환은 서버 전용 `createShortLink()` 한곳에서 관리한다. 화면별 fetch/외부 API 호출을 복제하지 않는다. 동일 강의·type_key는 하나의 링크다.

## Deployment workflow

When the user asks to deploy or apply changes, use the Git-backed production workflow unless they explicitly request a preview or a local-only deployment.

1. Review the deployment-scope changes and run the relevant tests, migration checks, and production build.
2. Apply and verify any pending Supabase migrations before releasing application code that depends on them.
3. Commit all user-approved, deployment-scope changes and push the current `main` branch to `origin/main`. Never overwrite or discard unrelated user changes.
4. Use the Vercel Git integration as the primary production deployment path. Do not create a separate CLI production deployment when the Git-triggered deployment is working.
5. Wait for the pushed commit's Vercel deployment to reach a terminal state, confirm the production alias points to it, verify an HTTP response, and inspect recent error logs.
6. Report the Git commit, migration result, production URL, deployment status, and any remaining test or monitoring warnings.
