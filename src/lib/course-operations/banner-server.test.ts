import assert from "node:assert/strict";
import test from "node:test";

import { readCourseOperationsRequest } from "./banner-server";

test("기존 JSON 강의 저장 요청은 배너 변경 없이 읽는다", async () => {
  const request = new Request("http://localhost/api/course-operations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "강의" }),
  });

  const result = await readCourseOperationsRequest(request);

  assert.deepEqual(result.body, { name: "강의" });
  assert.deepEqual(result.banner, { file: null, remove: false });
});

test("multipart 강의 저장 요청에서 배너 파일과 삭제 여부를 읽는다", async () => {
  const form = new FormData();
  form.set("course", JSON.stringify({ name: "강의" }));
  form.set(
    "banner",
    new File([new Uint8Array([1, 2, 3])], "banner.webp", {
      type: "image/webp",
    }),
  );
  const request = new Request("http://localhost/api/course-operations", {
    method: "POST",
    body: form,
  });

  const result = await readCourseOperationsRequest(request);

  assert.deepEqual(result.body, { name: "강의" });
  assert.equal(result.banner.file?.name, "banner.webp");
  assert.equal(result.banner.remove, false);
});
