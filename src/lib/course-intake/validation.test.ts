import assert from "node:assert/strict";
import test from "node:test";

import { parseCourseIntakeInput } from "./validation";

test("강의 자동 생성 입력을 검증하고 한국 시간으로 변환한다", () => {
  assert.deepEqual(
    parseCourseIntakeInput({
      courseName: " AI 강의 ",
      instructorName: " 권정인 ",
      freeWebinarDate: "2026-09-01",
      freeWebinarTime: "19:30",
      startsDate: "2026-09-10",
    }),
    {
      courseName: "AI 강의",
      instructorName: "권정인",
      freeWebinarAt: "2026-09-01T10:30:00.000Z",
      startsAt: "2026-09-09T15:00:00.000Z",
    },
  );
});

test("필수 강의 정보가 비어 있으면 거부한다", () => {
  assert.throws(
    () =>
      parseCourseIntakeInput({
        courseName: "",
        instructorName: "강사",
        freeWebinarDate: "2026-09-01",
        freeWebinarTime: "19:30",
        startsDate: "2026-09-10",
      }),
    /강의명/u,
  );
});

test("무료 웨비나는 지정된 네 가지 시간만 허용한다", () => {
  for (const freeWebinarTime of ["10:30", "19:30", "19:00", "20:00"]) {
    assert.doesNotThrow(() =>
      parseCourseIntakeInput({
        courseName: "AI 강의",
        instructorName: "강사",
        freeWebinarDate: "2026-09-01",
        freeWebinarTime,
        startsDate: "2026-09-10",
      }),
    );
  }
  assert.throws(
    () =>
      parseCourseIntakeInput({
        courseName: "AI 강의",
        instructorName: "강사",
        freeWebinarDate: "2026-09-01",
        freeWebinarTime: "18:00",
        startsDate: "2026-09-10",
      }),
    /무료 웨비나 시간/u,
  );
});
