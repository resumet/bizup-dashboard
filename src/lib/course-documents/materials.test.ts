import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_DOCUMENT_MATERIAL_LIMIT,
  courseDocumentMaterialPositionSchema,
  courseDocumentMaterials,
} from "./materials";

test("강의별 인스타 자료 슬롯을 1번부터 40번까지 만든다", () => {
  const materials = courseDocumentMaterials([
    { position: 2, title: "두 번째 자료", documentId: "00000000-0000-4000-8000-000000000002" },
  ]);

  assert.equal(materials.length, COURSE_DOCUMENT_MATERIAL_LIMIT);
  assert.deepEqual(materials[0], { position: 1, title: "", documentId: null });
  assert.deepEqual(materials[1], {
    position: 2,
    title: "두 번째 자료",
    documentId: "00000000-0000-4000-8000-000000000002",
  });
  assert.equal(materials.at(-1)?.position, 40);
});

test("인스타 자료 위치는 1번부터 40번까지만 허용한다", () => {
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(1).success, true);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(40).success, true);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(0).success, false);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(41).success, false);
});
