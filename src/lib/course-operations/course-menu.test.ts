import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { COURSE_MENU_ITEMS, getCourseMenuItems, getCourseNavigationItems } from "./course-menu";

test("공통 메뉴는 무료수강생·광고성과와 상태·삭제를 포함하고 강의 ID를 안전하게 연결한다", () => {
  const items = getCourseMenuItems("course/1");
  assert.deepEqual(items.map(item => item.kind), COURSE_MENU_ITEMS.map(item => item.kind));
  assert.equal(new Set(items.map(item => item.kind)).size, items.length);
  assert.equal(new Set(items.map(item => item.label)).size, items.length);
  assert.equal(items.find(item => item.kind === "free-students")?.href, "/services/course-operations/course%2F1/free-students");
  assert.equal(items.find(item => item.kind === "ads")?.href, "/services/course-operations/course%2F1/ad-performance");
  assert.deepEqual(items.filter(item => !item.href).map(item => item.kind), ["status", "delete"]);
  assert.equal(getCourseNavigationItems("course/1").length, items.length - 2);
});

test("검색·목록·상세는 화면별 메뉴 배열 없이 공통 렌더러를 사용한다", async () => {
  for (const path of [
    "src/components/dashboard/dashboard-course-options.tsx",
    "src/components/course-operations/course-list.tsx",
    "src/app/services/course-operations/[courseId]/page.tsx",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /<CourseManagementMenu\s/);
    assert.doesNotMatch(source, /<DropdownMenuItem[\s>]/);
  }
});
