import assert from "node:assert/strict";
import test from "node:test";

import { WORK_MANAGEMENT_HUB_ITEMS } from "./hub";

test("업무 관리 허브는 기존 하위 메뉴 전체를 카드 대상으로 제공한다", () => {
  assert.deepEqual(WORK_MANAGEMENT_HUB_ITEMS, [
    { label: "근태관리", href: "/hr/leave" },
    { label: "업무일지", href: "/hr" },
    { label: "비품신청", href: "/hr/supplies" },
    { label: "공용 캘린더", href: "/calendar" },
    { label: "강의 일정 플래너", href: "/services/course-schedule-planner" },
  ]);
});
