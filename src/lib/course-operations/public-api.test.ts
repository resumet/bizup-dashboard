import assert from "node:assert/strict";
import test from "node:test";
import { courseApiResponse } from "./public-api";

test("정확한 bizup.im 출처만 허용하고 차단된 요청은 DB를 조회하지 않는다", async () => {
  for (const origin of [undefined, "null", "http://bizup.im", "https://www.bizup.im", "https://bizup.im.evil.test", "https://evil.test", "https://bizup.im:444"]) {
    const response = await courseApiResponse(new Request("https://test/api", { headers: origin ? { Origin: origin } : {} }), async () => { throw new Error("must not load"); });
    assert.equal(response.status, 403);
    assert.equal(response.headers.get("access-control-allow-origin"), null);
  }
  const courses = [{ id: "course", name: "강의", instructorName: "강사", cohort: "1", webinarDate: null }];
  const response = await courseApiResponse(new Request("https://test/api", { headers: { Origin: "https://bizup.im" } }), async () => courses);
  assert.deepEqual(await response.json(), { courses });
  assert.equal(response.headers.get("access-control-allow-origin"), "https://bizup.im");
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});
test("프리플라이트는 조회 없이 처리하고 오류 응답은 내부 정보를 숨긴다", async () => {
  const response = await courseApiResponse(new Request("https://test/api", { method: "OPTIONS", headers: { Origin: "https://bizup.im", "Access-Control-Request-Method": "GET" } }), async () => { throw new Error("must not load"); });
  assert.equal(response.status, 204);
  const denied = await courseApiResponse(new Request("https://test/api", { method: "OPTIONS", headers: { Origin: "https://bizup.im", "Access-Control-Request-Method": "DELETE" } }), async () => []);
  assert.equal(denied.status, 403);
  const failed = await courseApiResponse(new Request("https://test/api", { headers: { Origin: "https://bizup.im" } }), async () => { throw new Error("private database detail"); });
  assert.equal(failed.status, 500);
  assert.doesNotMatch(await failed.text(), /private database detail/);
});
