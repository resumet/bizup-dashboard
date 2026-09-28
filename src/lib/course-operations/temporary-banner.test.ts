import assert from "node:assert/strict";
import test from "node:test";

import {
  TEMPORARY_COURSE_BANNER_HEIGHT,
  TEMPORARY_COURSE_BANNER_WIDTH,
  normalizeTemporaryCourseBannerInput,
  wrapTemporaryBannerText,
} from "./temporary-banner";

test("임시 배너는 16:9 크기를 사용한다", () => {
  assert.equal(TEMPORARY_COURSE_BANNER_WIDTH, 1600);
  assert.equal(TEMPORARY_COURSE_BANNER_HEIGHT, 900);
  assert.equal(
    TEMPORARY_COURSE_BANNER_WIDTH / TEMPORARY_COURSE_BANNER_HEIGHT,
    16 / 9,
  );
});

test("임시 배너 문구를 정리하고 웨비나 날짜를 한글로 표시한다", () => {
  assert.deepEqual(
    normalizeTemporaryCourseBannerInput({
      title: "  AI 실전 강의  ",
      instructorName: "  홍길동 ",
      webinarDate: "2026-09-29",
    }),
    {
      title: "AI 실전 강의",
      instructorName: "홍길동",
      webinarDate: "2026년 9월 29일",
    },
  );
});

test("임시 배너의 필수 정보가 없거나 날짜가 잘못되면 거부한다", () => {
  assert.throws(
    () =>
      normalizeTemporaryCourseBannerInput({
        title: "",
        instructorName: "홍길동",
        webinarDate: "2026-09-29",
      }),
    /강의명/u,
  );
  assert.throws(
    () =>
      normalizeTemporaryCourseBannerInput({
        title: "강의",
        instructorName: "홍길동",
        webinarDate: "2026-02-30",
      }),
    /날짜 형식/u,
  );
});

test("긴 제목은 주어진 너비 안에서 여러 줄로 나눈다", () => {
  assert.deepEqual(
    wrapTemporaryBannerText("가나다라마바사", 3, (value) => value.length),
    ["가나다", "라마바", "사"],
  );
});
