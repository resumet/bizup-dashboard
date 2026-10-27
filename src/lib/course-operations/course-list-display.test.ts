import assert from "node:assert/strict";
import test from "node:test";

import {
  COURSE_LIST_COLLAPSIBLE_STATUS_ORDER,
  formatCourseWbsProgress,
  getCourseManagementDestinations,
} from "./course-list-display";

test("완료를 진행 다음에 두고 보류를 상태 목록 맨 아래로 보낸다", () => {
  assert.deepEqual(COURSE_LIST_COLLAPSIBLE_STATUS_ORDER, [
    "completed",
    "canceled",
    "on_hold",
  ]);
});

test("강의 운영 목록 관리 메뉴가 강의별 서비스로 연결된다", () => {
  assert.deepEqual(getCourseManagementDestinations("course/1"), [
    {
      label: "강사 정보 받기",
      href: "/services/instructor-intakes?courseId=course%2F1",
    },
    {
      label: "강사 인스타그램 관리",
      href: "/services/instagram-management/course%2F1",
    },
    {
      label: "유튜브 출연 관리",
      href: "/services/youtube-management/course%2F1",
    },
    {
      label: "웨비나 정보",
      href: "/services/webinar-information/course%2F1",
    },
    {
      label: "수강생 관리 및 정산",
      href: "/services/course-operations/students-settlements/course%2F1",
    },
    {
      label: "강의별 해야할일",
      href: "/services/course-wbs?courseId=course%2F1",
    },
  ]);
});

test("WBS 전체 항목과 일정이 지난 항목 수를 함께 표시한다", () => {
  assert.equal(formatCourseWbsProgress(3, 28), "일정 지남 3개 / 전체 28개");
});
