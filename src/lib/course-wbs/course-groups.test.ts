import assert from "node:assert/strict";
import test from "node:test";

import { splitWbsCoursesByCompletion } from "./course-groups";
import type { CourseStatus } from "@/lib/course-operations/course-status";

const entry = (id: string, status: CourseStatus) => ({ id, course: { status } });

test("완료 강의만 종료 목록으로 옮기고 각 목록의 기존 순서를 유지한다", () => {
  const result = splitWbsCoursesByCompletion([
    entry("ongoing", "ongoing"),
    entry("completed-first", "completed"),
    entry("on-hold", "on_hold"),
    entry("canceled", "canceled"),
    entry("completed-second", "completed"),
  ]);

  assert.deepEqual(result.current.map(({ id }) => id), ["ongoing", "on-hold", "canceled"]);
  assert.deepEqual(result.completed.map(({ id }) => id), ["completed-first", "completed-second"]);
});
