import assert from "node:assert/strict";
import test from "node:test";

import {
  instagramDmMaterialHref,
  instagramDmMaterialValue,
  instagramExternalDmPath,
} from "./instagram-upload";

test("공개된 외부 작성 문서 링크를 빈 DM 자료에 자동 적용한다", () => {
  const published = { slug: "reels-guide", status: "published" as const };
  assert.equal(instagramExternalDmPath(published), "/article/reels-guide");
  assert.equal(instagramDmMaterialValue("", published), "/article/reels-guide");
  assert.equal(instagramDmMaterialValue("https://drive.google.com/example", published), "https://drive.google.com/example");
  assert.equal(instagramDmMaterialValue("", { ...published, status: "draft" }), "");
});

test("DM 자료 중 내부 공개 경로와 HTTP 링크만 바로가기로 표시한다", () => {
  assert.equal(instagramDmMaterialHref("/article/reels-guide"), "/article/reels-guide");
  assert.equal(instagramDmMaterialHref("https://example.com/file"), "https://example.com/file");
  assert.equal(instagramDmMaterialHref("자료는 카카오톡으로 전달"), "");
  assert.equal(instagramDmMaterialHref("javascript:alert(1)"), "");
});
