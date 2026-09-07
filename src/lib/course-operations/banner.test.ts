import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_COURSE_BANNER_SIZE,
  courseBannerUrl,
  validateCourseBannerFile,
} from "./banner";

test("강의 배너는 JPG·PNG·WebP와 8MB 이하만 허용한다", () => {
  assert.equal(
    validateCourseBannerFile({ name: "banner.png", type: "image/png", size: 1024 }),
    "png",
  );
  assert.throws(
    () => validateCourseBannerFile({ name: "banner.gif", type: "image/gif", size: 1024 }),
    /JPG, PNG, WebP/u,
  );
  assert.throws(
    () => validateCourseBannerFile({ name: "banner.jpg", type: "image/jpeg", size: MAX_COURSE_BANNER_SIZE + 1 }),
    /8MB/u,
  );
});

test("배너 내부 조회 주소를 강의별 버전과 함께 만든다", () => {
  assert.equal(
    courseBannerUrl("course-id", "2026-09-07T00:00:00.000Z"),
    "/api/course-operations/course-id/banner?v=2026-09-07T00%3A00%3A00.000Z",
  );
});
