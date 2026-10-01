import assert from "node:assert/strict";
import test from "node:test";

import { formatCourseDetailHeading, formatStudentSettlementHeading } from "./course-detail-heading";

test("강의 상세 제목을 기수·강사명·강의명·서울 날짜·시간 순서로 표시한다", () => {
  assert.equal(
    formatCourseDetailHeading({
      cohort: "1",
      instructorName: "미닝",
      courseName: "AI 인스타 대행 수익화 공식",
      webinarAt: "2026-10-01T11:00:00.000Z",
    }),
    "1기 • 미닝 • AI 인스타 대행 수익화 공식 • 2026. 10. 1. • 오후 8:00",
  );
});

test("수강생 정산 상세 제목은 기수·강의명·강사명·서울 날짜·시간 순서다", () => {
  assert.equal(formatStudentSettlementHeading({
    cohort: "1", courseName: "인스타그램 숏폼 대행", instructorName: "김해준", webinarAt: "2026-12-14T11:00:00Z",
  }), "1기 • 인스타그램 숏폼 대행 • 김해준 • 2026. 12. 14. • 오후 8:00");
  assert.equal(formatStudentSettlementHeading({
    cohort: null, courseName: "새 강의", instructorName: "", webinarAt: "2026-10-01T16:30:00Z",
  }), "기수 미지정 • 새 강의 • 강사 미지정 • 2026. 10. 2. • 오전 1:30");
});

test("기수와 강사명이 없으면 미지정 상태를 제목에 표시한다", () => {
  assert.equal(
    formatCourseDetailHeading({
      cohort: null,
      instructorName: "",
      courseName: "새 강의",
      webinarAt: "2026-10-01T00:00:00.000Z",
    }),
    "기수 미지정 • 강사 미지정 • 새 강의 • 2026. 10. 1. • 오전 9:00",
  );
});
