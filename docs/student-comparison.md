# 유료수강생 명단 비교

수강생관리 및 정산 화면 오른쪽 위의 **수강생 비교** 버튼에서 서로 다른 유료수강생 명단 두 개를 선택합니다. 각 강의의 유료수강생 탭에 저장된 최신 버전을 비교하며, 선택 목록은 팝업을 열 때 다시 불러옵니다.

- 국가번호·하이픈·공백을 정리한 전화번호가 양쪽에 있으면 중복으로 표시합니다. 이름만 같은 사람은 중복으로 판단하지 않습니다.
- 명단 안에서 같은 번호가 여러 번 나와도 한 명으로 집계합니다. 양쪽 명단의 이름과 이메일을 각각 보여주며 다른 이름이 저장되어 있으면 모두 표시합니다.
- 환불자는 제외하고 결제자와 수강생이 다르면 실제 수강생의 연락처를 사용합니다. 번호가 없거나 유효하지 않은 행은 비교에서 제외하고 건수를 표시합니다.
- 결과는 50명씩 표시합니다. 명단 선택을 변경하면 이전 결과를 지우며, 팝업을 닫으면 진행 중인 요청을 취소합니다.
- 비교는 읽기 전용입니다. API는 로그인·워크스페이스·강의 연결·유료 명단 여부를 검사하고 개인 정보 응답은 캐시하지 않습니다. DB 스키마 변경은 없습니다.

검증:

```powershell
node node_modules/tsx/dist/cli.mjs --conditions=react-server --test src/lib/course-operations/compare-paid-students.test.ts
$env:PLAYWRIGHT_PACKAGE_PATH=(Resolve-Path '.cache/course-order-browser/node_modules/playwright').Path
node scripts/verify-student-comparison.cjs
```

통합 검증은 실제 API와 UI를 메모리 DB 어댑터에 연결합니다. 권한 차단, 잘못된 명단 선택, 최신 버전, 1,000명 초과 조회, 페이지 이동, 중복 없음, 조회 실패 및 재시도, 팝업 닫기 후 이전 응답 무시, 모바일 화면을 확인합니다.
