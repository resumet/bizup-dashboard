import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_DOCUMENT_MATERIAL_LIMIT,
  courseDocumentDmMaterialUrlSchema,
  courseDocumentMaterialDescriptionSchema,
  courseDocumentMaterialPositionSchema,
  courseDocumentPlanningSheetUrlSchema,
  courseDocumentReferencePlanningNumberSchema,
  courseDocumentMaterials,
  instagramBulkFilmingSelectablePositions,
  mergeInstagramFilmingDates,
  parseInstagramBulkTitles,
  visibleExternalInstagramMaterials,
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
    editingCompleted: false,
    uploadDate: "",
    uploadCompleted: false,
    uploadedUrl: "",
    dmMaterial: "",
    dmNotRequired: false,
    dmMaterialDescription: "",
    additionalDescription: "",
  });
  assert.deepEqual(materials[1], {
    position: 2,
    title: "두 번째 자료",
    referencePlanningNumber: "07",
    documentId: "00000000-0000-4000-8000-000000000002",
    planningCompleted: false,
    filmingDate: "",
    filmingCompleted: false,
    editingCompleted: false,
    uploadDate: "",
    uploadCompleted: false,
    uploadedUrl: "",
    dmMaterial: "",
    dmNotRequired: false,
    dmMaterialDescription: "",
    additionalDescription: "",
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

test("공개용 자료 설명은 공백을 정리하고 5,000자까지 저장한다", () => {
  assert.equal(courseDocumentMaterialDescriptionSchema.parse(" DM 안내 "), "DM 안내");
  assert.equal(courseDocumentMaterialDescriptionSchema.safeParse("가".repeat(5000)).success, true);
  assert.equal(courseDocumentMaterialDescriptionSchema.safeParse("가".repeat(5001)).success, false);
});

test("외부 공개 목록은 제목이 있고 DM 자료가 필요한 항목만 표시한다", () => {
  const materials = courseDocumentMaterials([
    { position: 1, title: "공개 항목", documentId: null, dmMaterialDescription: "댓글 작성", additionalDescription: "확인 후 전송" },
    { position: 2, title: "숨김 항목", documentId: null, dmNotRequired: true },
    { position: 3, title: "", documentId: null },
  ], 3);

  assert.deepEqual(visibleExternalInstagramMaterials(materials).map((material) => material.position), [1]);
});

test("일괄 제목은 줄 순서를 유지하고 끝의 빈 줄만 제거한다", () => {
  assert.deepEqual(parseInstagramBulkTitles(" 첫 제목 \r\n\r\n세 번째 제목\n\n"), ["첫 제목", "", "세 번째 제목"]);
});

test("촬영 일정 일괄 변경은 업로드 완료 항목을 제외하고 날짜 필드만 합친다", () => {
  const materials = courseDocumentMaterials([], 3).map((material) => material.position === 2
    ? { ...material, title: "저장 전 제목", uploadCompleted: true }
    : material);

  assert.deepEqual(instagramBulkFilmingSelectablePositions(materials), [1, 3]);

  const merged = mergeInstagramFilmingDates(materials, [
    { position: 1, filmingDate: "2026-11-02" },
    { position: 3, filmingDate: "2026-11-02" },
  ]);
  assert.equal(merged[0].filmingDate, "2026-11-02");
  assert.equal(merged[1].filmingDate, "");
  assert.equal(merged[1].title, "저장 전 제목");
  assert.equal(merged[2].filmingDate, "2026-11-02");
});
