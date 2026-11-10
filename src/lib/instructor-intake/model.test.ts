import assert from "node:assert/strict";
import test from "node:test";
import {
  answersSchema,
  DEFAULT_INTAKE_SETTINGS,
  EMPTY_ANSWERS,
  formatWonWithKorean,
  intakeProgress,
  intakeSettingsSchema,
  saveSchema,
  tokenSchema,
} from "./model";

test("금액을 숫자와 한글 단위로 함께 표시한다", () => {
  assert.equal(formatWonWithKorean(3_000_000), "3,000,000원 (삼백만원)");
  assert.equal(formatWonWithKorean(-10_000), "-10,000원 (마이너스 일만원)");
});

test("공개 페이지의 문장·이미지 예시 설정은 항목별로 저장할 수 있다", () => {
  assert.ok(intakeSettingsSchema.safeParse(DEFAULT_INTAKE_SETTINGS).success);
  assert.equal(DEFAULT_INTAKE_SETTINGS.examples.webinarCoreContents.length, 5);
  assert.deepEqual(Object.keys(DEFAULT_INTAKE_SETTINGS.exampleImagePaths), [
    "evidence",
    "studentResults",
    "reviews",
    "opportunity",
  ]);
  assert.ok(
    intakeSettingsSchema.safeParse({
      examples: {
        ...DEFAULT_INTAKE_SETTINGS.examples,
        fieldStrengths: "워크스페이스별 수정 예시",
      },
      exampleImagePaths: {
        ...DEFAULT_INTAKE_SETTINGS.exampleImagePaths,
        opportunity: ["example.webp"],
      },
    }).success,
  );
});

const complete = {
  ...EMPTY_ANSWERS,
  residence: "서울",
  filmingLocations: "작업실",
  careerAndFilmingMaterials: "구독자 수와 사업 자산",
  practicalProcess: "제품 소싱부터 주문 확인까지",
  evidenceAvailability: [{ item: "매출 화면", canShow: "yes" as const, preparation: "보조 계정 준비" }],
  realName: "홍길동",
  nickname: "길동",
  phone: "01012345678",
  email: "TEST@EXAMPLE.COM",
  lectureItem: "스마트스토어",
  hasTeachingExperience: false,
  materialsUnavailable: true,
  youtubeUnavailable: true,
  monthlyRevenue: 0,
  monthlyProfit: -10000,
  expectedRevenue: 3000000,
  expectedProfit: 1000000,
  threeMonthExpectedRevenue: 5000000,
  threeMonthExpectedProfit: 2000000,
  studentSuccessRate: 80,
  studentFailureReasons: "실행 시간이 부족함",
  availableStudents: 3,
  availableStudentCandidates: [
    { nickname: "수강생1", name: "", phone: "" },
    { nickname: "수강생2", name: "이름", phone: "" },
    { nickname: "수강생3", name: "", phone: "010-1234-5678" },
  ],
  courseContentIntroduction: "강의 소개",
  instructorCareer: "강사 이력",
  studentSuccessDescription: "성과 설명",
  differentiators: "차별점",
  webinarCoreContents: ["1", "2", "3", "4", "5"],
  fieldStrengths: "특장점",
  recommendedAudience: "추천 대상",
  webinarBenefits: "수강 혜택",
  opportunityEvidence: "기회 증거",
  instagramAccountId: "instagram-id",
  instagramAccountPassword: "instagram-password",
  blueBadge: "신청 완료",
  twoFactorSecurity: "설정 완료",
  infokLinkId: "infok-id",
  infokLinkPassword: "infok-password",
};
const images = {
  evidence: ["evidence.webp"],
  studentResults: ["result.webp"],
  reviews: ["review.webp"],
  opportunity: ["opportunity.webp"],
};
test("수집률은 새 촬영 정보까지 포함하며 텍스트·이미지·0원 응답을 인정한다", () => {
  assert.equal(intakeProgress(EMPTY_ANSWERS, 0).received, 0);
  assert.deepEqual(intakeProgress(complete, 1, images), {
    completed: Array(37).fill(true),
    received: 37,
    total: 37,
    percent: 100,
  });
  assert.equal(
    intakeProgress({ ...complete, expectedProfit: null }, 1, images).received,
    36,
  );
  assert.equal(
    intakeProgress(
      {
        ...complete,
        hasTeachingExperience: true,
        teachingCount: 1,
        studentCount: null,
      },
      1, images,
    ).received,
    36,
  );
  assert.equal(intakeProgress({ ...complete, realName: "" }, 1, images).percent, 97);
  assert.equal(
    intakeProgress({ ...complete, instagramAccountPassword: "" }, 1, images).received,
    36,
  );
  assert.equal(intakeProgress(complete, 1, { ...images, reviews: [] }).received, 36);
  assert.equal(
    intakeProgress({ ...complete, availableStudentCandidates: [{ nickname: "수강생1", name: "", phone: "" }] }, 1, images).received,
    36,
  );
  assert.equal(
    intakeProgress({ ...complete, availableStudentCandidates: [{ nickname: "", name: "", phone: "" }, ...complete.availableStudentCandidates.slice(1)] }, 1, images).received,
    36,
  );
});
test("중간 저장은 허용하고 최종 제출은 사진과 모든 정보를 요구한다", () => {
  assert.ok(
    saveSchema.safeParse({
      answers: EMPTY_ANSWERS,
      photoPaths: [],
      imagePaths: { evidence: [], studentResults: [], reviews: [], opportunity: [] },
      revision: 0,
      submit: false,
    }).success,
  );
  assert.ok(
    !saveSchema.safeParse({
      answers: EMPTY_ANSWERS,
      photoPaths: [],
      imagePaths: { evidence: [], studentResults: [], reviews: [], opportunity: [] },
      revision: 0,
      submit: true,
    }).success,
  );
  assert.ok(
    !saveSchema.safeParse({
      answers: complete,
      photoPaths: [],
      imagePaths: images,
      revision: 0,
      submit: true,
    }).success,
  );
  assert.ok(
    saveSchema.safeParse({
      answers: complete,
      photoPaths: ["photo.webp"],
      imagePaths: images,
      revision: 0,
      submit: true,
    }).success,
  );
  assert.ok(
    !saveSchema.safeParse({
      answers: complete,
      photoPaths: ["same", "same"],
      imagePaths: images,
      revision: 0,
      submit: false,
    }).success,
  );
});
test("조건부 강의 경험, 최소 3명, 금액과 안전한 URL을 검증한다", () => {
  assert.equal(answersSchema.parse(complete).phone, "010-1234-5678");
  assert.equal(answersSchema.parse(complete).email, "test@example.com");
  assert.equal(
    answersSchema.parse({ ...complete, teachingCount: 3 }).teachingCount,
    null,
  );
  for (const patch of [
    { availableStudents: 2 },
    { studentSuccessRate: 101 },
    { phone: "010-123-4567" },
    { email: "not-an-email" },
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
  assert.ok(!answersSchema.safeParse({ ...complete, webinarCoreContents: Array(6).fill("내용") }).success);
  assert.ok(!tokenSchema.safeParse("guessable-link").success);
});
