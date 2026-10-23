import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_DOCUMENT_MATERIAL_LIMIT,
  courseDocumentDmMaterialUrlSchema,
  courseDocumentMaterialPositionSchema,
  courseDocumentPlanningSheetUrlSchema,
  courseDocumentReferencePlanningNumberSchema,
  courseDocumentMaterials,
} from "./materials";

test("강의별 인스타 자료 슬롯을 설정한 전체 진행 건수만큼 만든다", () => {
  const materials = courseDocumentMaterials([
    { position: 2, title: "두 번째 자료", referencePlanningNumber: "07", documentId: "00000000-0000-4000-8000-000000000002" },
  ], 40);

  assert.equal(materials.length, 40);
  assert.deepEqual(materials[0], {
    position: 1,
    title: "",
    referencePlanningNumber: "",
    documentId: null,
    planningCompleted: false,
    filmingDate: "",
    filmingCompleted: false,
    uploadDate: "",
    uploadCompleted: false,
    uploadedUrl: "",
    dmMaterial: "",
  });
  assert.deepEqual(materials[1], {
    position: 2,
    title: "두 번째 자료",
    referencePlanningNumber: "07",
    documentId: "00000000-0000-4000-8000-000000000002",
    planningCompleted: false,
    filmingDate: "",
    filmingCompleted: false,
    uploadDate: "",
    uploadCompleted: false,
    uploadedUrl: "",
    dmMaterial: "",
  });
  assert.equal(materials.at(-1)?.position, 40);
});

test("인스타 자료 위치는 1번부터 500번까지만 허용한다", () => {
  assert.equal(COURSE_DOCUMENT_MATERIAL_LIMIT, 500);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(1).success, true);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(500).success, true);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(0).success, false);
  assert.equal(courseDocumentMaterialPositionSchema.safeParse(501).success, false);
});

test("기획번호는 한두 자리 숫자를 두 자리로 정규화한다", () => {
  assert.equal(courseDocumentReferencePlanningNumberSchema.parse("1"), "01");
  assert.equal(courseDocumentReferencePlanningNumberSchema.parse("12"), "12");
  assert.equal(courseDocumentReferencePlanningNumberSchema.parse(""), "");
  assert.equal(courseDocumentReferencePlanningNumberSchema.safeParse("123").success, false);
  assert.equal(courseDocumentReferencePlanningNumberSchema.safeParse("A1").success, false);
});

test("기획시트 URL은 HTTP 또는 HTTPS 주소만 허용한다", () => {
  assert.equal(courseDocumentPlanningSheetUrlSchema.parse("https://docs.google.com/spreadsheets/d/example"), "https://docs.google.com/spreadsheets/d/example");
  assert.equal(courseDocumentPlanningSheetUrlSchema.parse(""), "");
  assert.equal(courseDocumentPlanningSheetUrlSchema.safeParse("javascript:alert(1)").success, false);
  assert.equal(courseDocumentPlanningSheetUrlSchema.safeParse("기획시트").success, false);
});

test("DM 자료 링크는 HTTP 또는 HTTPS 주소만 허용한다", () => {
  assert.equal(courseDocumentDmMaterialUrlSchema.parse("https://example.com/dm-guide"), "https://example.com/dm-guide");
  assert.equal(courseDocumentDmMaterialUrlSchema.parse(""), "");
  assert.equal(courseDocumentDmMaterialUrlSchema.safeParse("javascript:alert(1)").success, false);
  assert.equal(courseDocumentDmMaterialUrlSchema.safeParse("DM 자료").success, false);
});
