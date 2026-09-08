import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";

import {
  COURSE_BANNER_MAX_HEIGHT,
  COURSE_BANNER_MAX_WIDTH,
  optimizeCourseBanner,
  readCourseOperationsRequest,
} from "./banner-server";

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

test("큰 강의 배너를 1600×900 이내 WebP로 최적화한다", async () => {
  const original = await sharp({
    create: {
      width: 2_400,
      height: 1_350,
      channels: 3,
      background: { r: 30, g: 100, b: 200 },
    },
  })
    .png()
    .toBuffer();
  const file = new File([original], "large-banner.png", { type: "image/png" });

  const optimized = await optimizeCourseBanner(file);
  const metadata = await sharp(optimized).metadata();

  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, COURSE_BANNER_MAX_WIDTH);
  assert.equal(metadata.height, COURSE_BANNER_MAX_HEIGHT);
  assert.ok(optimized.byteLength < original.byteLength);
});

test("작은 강의 배너는 확대하지 않고 잘못된 이미지 데이터는 거부한다", async () => {
  const original = await sharp({
    create: {
      width: 800,
      height: 450,
      channels: 3,
      background: { r: 240, g: 240, b: 240 },
    },
  })
    .jpeg()
    .toBuffer();
  const optimized = await optimizeCourseBanner(
    new File([original], "small-banner.jpg", { type: "image/jpeg" }),
  );
  const metadata = await sharp(optimized).metadata();

  assert.equal(metadata.width, 800);
  assert.equal(metadata.height, 450);
  await assert.rejects(
    () =>
      optimizeCourseBanner(
        new File(["not an image"], "broken.png", { type: "image/png" }),
      ),
    /이미지 파일을 처리할 수 없습니다/u,
  );
});
