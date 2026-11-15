import assert from "node:assert/strict";
import test from "node:test";
import { parseApplicants, filterApplicants, applicantValue } from "./model";
import { fetchApplicants, resolveFreeCourseId } from "./source";

const id = "88b413ed-0ee1-4fd5-872d-b7ede9cb1f53";
const link = `https://www.bizupclass.com/free-courses/${id}`;
const fixture = { title: '강의 ["A"]', username: "테스트", email: "TEST@example.test", phone: "010-1234-5678", appliedAt: "$D2026-11-15T17:00:00.000Z", inflowPath: "오가닉", mediaChannel: "구글", isNewUser: false, createdAt: null, firstInflowFreeCourseTitle: "첫 강의", kakaoRefreshToken: "must-not-save" };

test("RSC의 괄호와 이스케이프 문자열, 날짜, 빈 값과 회원 상태를 보존하고 인증 필드는 제외한다", () => {
  const rows = parseApplicants(`a:["$",{"data":${JSON.stringify([fixture])}}]`);
  assert.equal(rows.length, 1);
  assert.equal(Object.keys(rows[0]).length, 10);
  assert.equal(rows[0].title, fixture.title);
  assert.equal(rows[0].isNewUser, false);
  assert.equal(rows[0].createdAt, null);
  assert.equal("kakaoRefreshToken" in rows[0], false);
  assert.equal(applicantValue("appliedAt", rows[0].appliedAt), "2026-11-16 02:00:00");
  for (const query of ["테스트", "test@", "0101234", "구글", "첫 강의", "2026-11-16", "아니오"]) assert.equal(filterApplicants(rows, query).length, 1);
  assert.equal(filterApplicants(rows, "없는 검색어").length, 0);
});

test("명시적인 빈 배열만 0명으로 처리하고 로그인·불완전·다른 데이터는 실패한다", () => {
  assert.deepEqual(parseApplicants('a:{"data":[]}'), []);
  for (const text of ['login', 'a:{"freeCourse":{}}', 'a:{"data":[', 'a:{"data":[{"username":"x"}]}']) assert.throws(() => parseApplicants(text));
});

test("직접 링크와 네이버 리다이렉트를 해석하고 외부·내부망·인증 포함 URL은 요청하지 않는다", async () => {
  assert.equal(await resolveFreeCourseId(`${link}/?utm_source=test`), id);
  assert.equal(await resolveFreeCourseId(`https://admin.systemnova.co.kr/free-courses/${id}/apply`), id);
  const redirectFetch = (async () => new Response(null, { status: 308, headers: { location: link } })) as typeof fetch;
  assert.equal(await resolveFreeCourseId("https://m.site.naver.com/test", redirectFetch), id);
  const neverFetch = (async () => { throw new Error("must not request"); }) as typeof fetch;
  for (const url of ["http://127.0.0.1", "https://evil.test/free-courses/" + id, link.replace("https://", "https://user:pass@"), ""]) {
    await assert.rejects(resolveFreeCourseId(url, neverFetch), error => error instanceof Error && error.message !== "must not request");
  }
  await assert.rejects(resolveFreeCourseId("https://m.site.naver.com/test", (async () => new Response(null, { status: 302, headers: { location: "http://127.0.0.1/private" } })) as typeof fetch));
});

test("로그인 쿠키는 고정된 관리자 원본에만 전송하며 전체 명단과 인증 오류를 구분한다", async () => {
  const oldId = process.env.SYSTEMNOVA_ADMIN_ID, oldPassword = process.env.SYSTEMNOVA_ADMIN_PASSWORD;
  process.env.SYSTEMNOVA_ADMIN_ID = "test"; process.env.SYSTEMNOVA_ADMIN_PASSWORD = "test";
  try {
    let calls = 0;
    const request = (async (url, init) => {
      assert.ok(String(url).startsWith("https://admin.systemnova.co.kr/"));
      assert.equal(init?.redirect, "manual");
      calls++;
      if (String(url).endsWith("/api/login")) return new Response(null, { headers: { "set-cookie": "AdminSession=test; Path=/; HttpOnly" } });
      assert.equal(new Headers(init?.headers).get("cookie"), "AdminSession=test");
      return new Response(`a:{"data":${JSON.stringify(Array.from({ length: 201 }, () => fixture))}}`);
    }) as typeof fetch;
    assert.equal((await fetchApplicants(link, request)).length, 201);
    assert.equal(calls, 2);
    await assert.rejects(fetchApplicants(link, (async () => new Response(null, { status: 401 })) as typeof fetch), /로그인/);
  } finally {
    if (oldId === undefined) delete process.env.SYSTEMNOVA_ADMIN_ID; else process.env.SYSTEMNOVA_ADMIN_ID = oldId;
    if (oldPassword === undefined) delete process.env.SYSTEMNOVA_ADMIN_PASSWORD; else process.env.SYSTEMNOVA_ADMIN_PASSWORD = oldPassword;
  }
});
