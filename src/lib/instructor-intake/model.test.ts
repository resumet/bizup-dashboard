import assert from "node:assert/strict";
import test from "node:test";
import {
  answersSchema,
  EMPTY_ANSWERS,
  intakeProgress,
  saveSchema,
  tokenSchema,
} from "./model";

const complete = {
  ...EMPTY_ANSWERS,
  realName: "홍길동",
  nickname: "길동",
  lectureItem: "스마트스토어",
  hasTeachingExperience: false,
  materialsUnavailable: true,
  youtubeUnavailable: true,
  monthlyRevenue: 0,
  monthlyProfit: -10000,
  expectedRevenue: 3000000,
  expectedProfit: 1000000,
  availableStudents: 3,
};
test("수집률은 11개 항목을 기준으로 하며 0원·적자·없음 응답을 인정한다", () => {
  assert.equal(intakeProgress(EMPTY_ANSWERS, 0).received, 0);
  assert.deepEqual(intakeProgress(complete, 1), {
    completed: Array(11).fill(true),
    received: 11,
    total: 11,
    percent: 100,
  });
  assert.equal(
    intakeProgress({ ...complete, expectedProfit: null }, 1).received,
    10,
  );
  assert.equal(
    intakeProgress(
      {
        ...complete,
        hasTeachingExperience: true,
        teachingCount: 1,
        studentCount: null,
      },
      1,
    ).received,
    10,
  );
  assert.equal(intakeProgress({ ...complete, realName: "" }, 1).percent, 91);
});
test("중간 저장은 허용하고 최종 제출은 사진과 모든 정보를 요구한다", () => {
  assert.ok(
    saveSchema.safeParse({
      answers: EMPTY_ANSWERS,
      photoPaths: [],
      revision: 0,
      submit: false,
    }).success,
  );
  assert.ok(
    !saveSchema.safeParse({
      answers: EMPTY_ANSWERS,
      photoPaths: [],
      revision: 0,
      submit: true,
    }).success,
  );
  assert.ok(
    !saveSchema.safeParse({
      answers: complete,
      photoPaths: [],
      revision: 0,
      submit: true,
    }).success,
  );
  assert.ok(
    saveSchema.safeParse({
      answers: complete,
      photoPaths: ["photo.webp"],
      revision: 0,
      submit: true,
    }).success,
  );
  assert.ok(
    !saveSchema.safeParse({
      answers: complete,
      photoPaths: ["same", "same"],
      revision: 0,
      submit: false,
    }).success,
  );
});
test("조건부 강의 경험, 최소 3명, 금액과 안전한 URL을 검증한다", () => {
  assert.equal(
    answersSchema.parse({ ...complete, teachingCount: 3 }).teachingCount,
    null,
  );
  for (const patch of [
    { availableStudents: 2 },
    { monthlyRevenue: -1 },
    { expectedRevenue: 1.1 },
    { studentCount: 0 },
    { materialsUrls: ["잘못된 주소"], materialsUnavailable: false },
    { youtubeUrls: ["not-a-url"], youtubeUnavailable: false },
    { materialsUrls: ["javascript:alert(1)"], materialsUnavailable: false },
    {
      youtubeUrls: ["https://youtube.com.evil.example/video"],
      youtubeUnavailable: false,
    },
    {
      materialsUrls: ["https://drive.google.com/folder"],
      materialsUnavailable: true,
    },
  ]) {
    assert.ok(
      !answersSchema.safeParse({ ...complete, ...patch }).success,
      JSON.stringify(patch),
    );
  }
  assert.ok(
    answersSchema.safeParse({
      ...complete,
      youtubeUnavailable: false,
      youtubeUrls: [
        "https://youtu.be/abc",
        "https://www.youtube.com/watch?v=abc",
      ],
    }).success,
  );
  assert.ok(!tokenSchema.safeParse("guessable-link").success);
});
