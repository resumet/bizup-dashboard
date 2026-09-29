import assert from "node:assert/strict";
import test from "node:test";

import {
  emptyInstagramMaterials,
  instagramMaterialNotionUrlSchema,
  instagramMaterialPositionSchema,
  instagramMaterialTitleSchema,
} from "./instagram-materials";

test("인스타 자료는 강의별로 40개의 번호 항목으로 시작한다", () => {
  const materials = emptyInstagramMaterials();
  assert.equal(materials.length, 40);
  assert.deepEqual([materials[0], materials.at(-1)], [
    { position: 1, title: "", notionUrl: "" },
    { position: 40, title: "", notionUrl: "" },
  ]);
});

test("인스타 자료는 제목 길이와 안전한 노션 링크를 검증한다", () => {
  assert.equal(instagramMaterialPositionSchema.safeParse(41).success, false);
  assert.equal(instagramMaterialTitleSchema.parse(" 자료 제목 "), "자료 제목");
  assert.equal(instagramMaterialNotionUrlSchema.parse(""), "");
  assert.equal(instagramMaterialNotionUrlSchema.parse(" https://www.notion.so/example "), "https://www.notion.so/example");
  assert.equal(instagramMaterialNotionUrlSchema.safeParse("not a url").success, false);
  assert.equal(instagramMaterialNotionUrlSchema.safeParse("javascript:alert(1)").success, false);
});
