# bizup.im 강의 목록 API

`GET https://bizup-dashboard.vercel.app/api/public/courses`

공용 워크스페이스의 전체 강의(모든 상태)를 반환합니다. 서울 날짜 기준으로 가까운 예정 웨비나, 최근 지난 웨비나, 날짜 미정 순으로 정렬합니다.

```javascript
// https://bizup.im 페이지의 브라우저 JavaScript에서 실행합니다.
const response = await fetch("https://bizup-dashboard.vercel.app/api/public/courses", {
  credentials: "omit",
});
if (!response.ok) throw new Error(`강의 조회 실패: ${response.status}`);
const { courses } = await response.json();
```

```json
{
  "courses": [
    {
      "id": "강의 UUID",
      "name": "강의명",
      "instructorName": "강사명",
      "cohort": "1",
      "webinarDate": "2026-12-01T10:30:00+00:00"
    }
  ]
}
```

`webinarDate`는 타임존이 포함된 웨비나 일시이며, 미설정이면 `null`입니다. 빈 목록은 `courses: []`로 반환합니다.

- `Origin: https://bizup.im`만 허용합니다. 브라우저가 Origin을 자동 설정하므로 직접 추가할 필요가 없습니다.
- HTTP, www 및 하위 도메인, 다른 포트, Origin 없는 요청은 403입니다.
- GET과 OPTIONS를 지원하며 쿠키 인증은 필요하지 않습니다. 응답은 캐시하지 않습니다.
- 조회 실패는 500이며 내부 DB 정보는 응답에 포함하지 않습니다.
- 서버 간 요청은 Origin을 위조할 수 있습니다. 이 검사는 브라우저 출처 제한이며 호출자 신원 인증은 아닙니다.
- 대상 워크스페이스는 PRIMARY_WORKSPACE_ID, COURSE_INTAKE_WORKSPACE_ID 순으로 설정값을 사용하고, 둘 다 없으면 유일한 is_primary 워크스페이스를 사용합니다. 요청에서 워크스페이스를 지정할 수 없습니다.
