import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyInstagramMaterials,
  extractPublicNotionPageId,
  instagramMaterialNotionUrlSchema,
  instagramMaterialPositionSchema,
  instagramMaterialTitleSchema,
  isPublicNotionUrl,
  normalizePublicNotionUrl,
  toPublicNotionEmbedUrl,
} from "./instagram-materials";

test("인스타 자료는 강의별로 40개의 번호 항목으로 시작한다", () => {
  const materials = emptyInstagramMaterials();
  assert.equal(materials.length, 40);
  assert.deepEqual([materials[0], materials.at(-1)], [
    { position: 1, title: "", notionUrl: "" },
    { position: 40, title: "", notionUrl: "" },
  ]);
});

test("인스타 자료는 제목 길이와 공개된 Notion Sites 주소를 검증한다", () => {
  const publicUrl = "https://darkened-stock-6c1.notion.site/37a95b2493eb807b843ef6a59125a4df?source=copy_link";
  assert.equal(instagramMaterialPositionSchema.safeParse(41).success, false);
  assert.equal(instagramMaterialTitleSchema.parse(" 자료 제목 "), "자료 제목");
  assert.equal(instagramMaterialNotionUrlSchema.parse(""), "");
  assert.equal(instagramMaterialNotionUrlSchema.parse(` ${publicUrl} `), publicUrl);
  assert.equal(instagramMaterialNotionUrlSchema.parse(`[자료](${publicUrl})`), publicUrl);
  assert.equal(normalizePublicNotionUrl(publicUrl), publicUrl);
  assert.equal(isPublicNotionUrl(publicUrl), true);
  assert.equal(extractPublicNotionPageId(publicUrl), "37a95b2493eb807b843ef6a59125a4df");
  assert.equal(toPublicNotionEmbedUrl(publicUrl), "https://darkened-stock-6c1.notion.site/ebd/37a95b2493eb807b843ef6a59125a4df");
  assert.equal(instagramMaterialNotionUrlSchema.safeParse("https://www.notion.so/example").success, false);
  assert.equal(instagramMaterialNotionUrlSchema.safeParse("https://example.com/page").success, false);
  assert.equal(instagramMaterialNotionUrlSchema.safeParse("javascript:alert(1)").success, false);
});
