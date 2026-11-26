import assert from "node:assert/strict";
import test from "node:test";
import { guideSchema, initialGuide } from "./model";
import { registeredReplayType, REPLAY_GUIDE_TYPE_LABEL } from "../short-links/types";
import { issueCourseShortLink } from "../short-links/browser";

test("안내문은 강의명과 일곱 섹션으로 시작하고 위험한 링크와 중복 섹션을 거부한다", () => {
  const guide = initialGuide("테스트 강의");
  assert.deepEqual(guideSchema.parse(guide), guide);
  assert.equal(guide.sections.length, 7);
  assert.ok(guide.sections[2].body.includes("테스트 강의"));
  assert.equal(guideSchema.safeParse({ ...guide, sections: [guide.sections[0], guide.sections[0]] }).success, false);
  guide.sections[1].link = "javascript:alert(1)";
  assert.equal(guideSchema.safeParse(guide).success, false);
});

test("안내문은 서버에 등록된 전용 유형 하나만 사용하고 기존 화면의 키는 재사용하지 않는다", () => {
  const type = { key: "provider_test_key", label: REPLAY_GUIDE_TYPE_LABEL, active: true };
  assert.deepEqual(registeredReplayType([type]), type);
  for (const types of [[], [{ ...type, active: false }], [{ ...type, key: "aftersales" }], [type, { ...type, key: "another" }]]) {
    assert.equal(registeredReplayType(types), undefined);
  }
});

test("공통 발급 창구에는 강의와 안내문 용도만 전달한다", async () => {
  const course_id = "00000000-0000-4000-8000-000000000001";
  const result = await issueCourseShortLink({ course_id, purpose: "replay-guide" }, async (url, init) => {
    assert.equal(url, `/api/course-operations/${course_id}/short-links`);
    assert.deepEqual(JSON.parse(String(init?.body)), { purpose: "replay-guide" });
    return Response.json({ short_url: "https://bizup.im/example", existing: true });
  });
  assert.equal(result.short_url, "https://bizup.im/example");
});
