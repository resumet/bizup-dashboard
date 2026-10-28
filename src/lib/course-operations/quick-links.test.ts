import assert from "node:assert/strict";
import test from "node:test";

import { buildCourseQuickLinks, type QuickLinkCourseRow } from "./quick-links";

function course(overrides: Partial<QuickLinkCourseRow> = {}): QuickLinkCourseRow {
  return {
    id: "course-1",
    name: "AI 강의",
    instructor_name: "김선아",
    landing_page_link: "",
    payment_link: "",
    course_materials_link: "https://drive.google.com/instructor-materials",
    course_canva_link: "https://www.canva.com/design/fixed",
    free_kakao_room_1_link: "",
    free_kakao_room_2_link: "",
    paid_kakao_room_link: "",
    communication_room_link: "",
    custom_links: [],
    ...overrides,
  };
}

test("강사자료 폴더와 교안(캔바)을 서로 다른 고정 링크로 제공한다", () => {
  const result = buildCourseQuickLinks(course());
  assert.deepEqual(
    result.links.filter((link) => ["강사자료 폴더", "교안(캔바)"].includes(link.label)),
    [
      { label: "강사자료 폴더", url: "https://drive.google.com/instructor-materials" },
      { label: "교안(캔바)", url: "https://www.canva.com/design/fixed" },
    ],
  );
});

test("새 고정값이 없으면 기존 커스텀 교안 링크를 호환값으로 사용한다", () => {
  const result = buildCourseQuickLinks(course({
    course_canva_link: "",
    custom_links: [
      { name: "강사 사진", url: "https://example.com/photos" },
      { name: "교안 링크", url: "https://www.canva.com/design/legacy" },
    ],
  }));
  assert.deepEqual(
    result.links.find((link) => link.label === "교안(캔바)"),
    { label: "교안(캔바)", url: "https://www.canva.com/design/legacy" },
  );
});
