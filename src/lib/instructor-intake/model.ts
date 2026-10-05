import { z } from "zod";

export const PHOTO_BUCKET = "instructor-profile-photos";
export const MAX_PHOTOS = 5;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);
const text = (max: number) => z.string().trim().max(max);
const count = z.number().int().min(1).max(1_000_000).nullable();
const money = z.number().int().min(0).max(1_000_000_000_000).nullable();
const profit = z
  .number()
  .int()
  .min(-1_000_000_000_000)
  .max(1_000_000_000_000)
  .nullable();
const url = z
  .string()
  .trim()
  .max(2000)
  .url("올바른 URL을 입력해 주세요.")
  .refine((value) => {
    try {
      const parsed = new URL(value);
      return (
        ["https:", "http:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }, "http 또는 https URL을 입력해 주세요.");
const youtube = url.refine((value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return (
      host === "youtu.be" ||
      host === "youtube.com" ||
      host.endsWith(".youtube.com")
    );
  } catch {
    return false;
  }
}, "유튜브 영상 URL을 입력해 주세요.");

export const answersSchema = z
  .object({
    realName: text(80),
    nickname: text(80),
    lectureItem: text(3000),
    hasTeachingExperience: z.boolean().nullable(),
    teachingCount: count,
    studentCount: count,
    materialsUrls: z.array(url).max(10),
    materialsUnavailable: z.boolean(),
    youtubeUrls: z.array(youtube).max(10),
    youtubeUnavailable: z.boolean(),
    monthlyRevenue: money,
    monthlyProfit: profit,
    expectedRevenue: money,
    expectedProfit: profit,
    availableStudents: z
      .number()
      .int()
      .min(3, "출연 가능한 수강생은 최소 3명이어야 합니다.")
      .max(100_000)
      .nullable(),
  })
  .superRefine((value, context) => {
    if (value.materialsUnavailable && value.materialsUrls.length)
      context.addIssue({
        code: "custom",
        path: ["materialsUrls"],
        message: "자료가 없으면 자료 URL을 비워 주세요.",
      });
    if (value.youtubeUnavailable && value.youtubeUrls.length)
      context.addIssue({
        code: "custom",
        path: ["youtubeUrls"],
        message: "출연 영상이 없으면 영상 URL을 비워 주세요.",
      });
  })
  .transform((value) =>
    value.hasTeachingExperience === false
      ? { ...value, teachingCount: null, studentCount: null }
      : value,
  );

export type Answers = z.infer<typeof answersSchema>;
export type Photo = { path: string; url: string };
export const EMPTY_ANSWERS: Answers = {
  realName: "",
  nickname: "",
  lectureItem: "",
  hasTeachingExperience: null,
  teachingCount: null,
  studentCount: null,
  materialsUrls: [],
  materialsUnavailable: false,
  youtubeUrls: [],
  youtubeUnavailable: false,
  monthlyRevenue: null,
  monthlyProfit: null,
  expectedRevenue: null,
  expectedProfit: null,
  availableStudents: null,
};
export const FIELD_LABELS = [
  "본명",
  "닉네임",
  "프로필 사진",
  "강의 아이템",
  "기존 강의 경험",
  "기존 강의 자료·무료강의 영상",
  "유튜브 출연 영상",
  "강의 외 월 매출",
  "월 순이익",
  "수강 후 3개월 내 예상 매출·순이익",
  "무료강의 출연 가능 수강생",
];
export function intakeProgress(answers: Answers, photoCount: number) {
  const completed = [
    !!answers.realName,
    !!answers.nickname,
    photoCount > 0,
    !!answers.lectureItem,
    answers.hasTeachingExperience === false ||
      (answers.hasTeachingExperience === true &&
        answers.teachingCount !== null &&
        answers.studentCount !== null),
    answers.materialsUnavailable || answers.materialsUrls.length > 0,
    answers.youtubeUnavailable || answers.youtubeUrls.length > 0,
    answers.monthlyRevenue !== null,
    answers.monthlyProfit !== null,
    answers.expectedRevenue !== null && answers.expectedProfit !== null,
    answers.availableStudents !== null && answers.availableStudents >= 3,
  ];
  const received = completed.filter(Boolean).length;
  return {
    completed,
    received,
    total: completed.length,
    percent: Math.round((received / completed.length) * 100),
  };
}
export const saveSchema = z
  .object({
    answers: answersSchema,
    photoPaths: z.array(z.string().max(300)).max(MAX_PHOTOS),
    revision: z.number().int().min(0),
    submit: z.boolean(),
  })
  .superRefine((value, context) => {
    if (new Set(value.photoPaths).size !== value.photoPaths.length)
      context.addIssue({
        code: "custom",
        message: "중복된 사진이 포함되어 있습니다.",
      });
    if (value.submit) {
      const progress = intakeProgress(value.answers, value.photoPaths.length);
      if (progress.received !== progress.total)
        context.addIssue({
          code: "custom",
          message: `제출 전에 다음 항목을 입력해 주세요: ${FIELD_LABELS.filter((_, index) => !progress.completed[index]).join(", ")}`,
        });
    }
  });
export const createIntakeSchema = z.object({
  courseId: z.string().uuid("기존 강의를 선택해 주세요."),
});

const koreanDigits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const koreanSmallUnits = ["", "십", "백", "천"];
const koreanLargeUnits = ["", "만", "억", "조"];
function koreanChunk(value: number) {
  let result = "";
  const digits = String(value).padStart(4, "0");
  for (let index = 0; index < 4; index += 1) {
    const digit = Number(digits[index]);
    if (!digit) continue;
    result += `${digit === 1 && index < 3 ? "" : koreanDigits[digit]}${koreanSmallUnits[3 - index]}`;
  }
  return result;
}
export function formatKoreanWon(value: number | null) {
  if (value === null || !Number.isInteger(value) || value < 0) return "";
  if (value === 0) return "영원";
  let rest = value;
  let unitIndex = 0;
  const chunks: string[] = [];
  while (rest > 0) {
    const chunk = rest % 10_000;
    if (chunk)
      chunks.unshift(`${koreanChunk(chunk)}${koreanLargeUnits[unitIndex]}`);
    rest = Math.floor(rest / 10_000);
    unitIndex += 1;
  }
  return `${chunks.join("")}원`;
}
export function formatWonWithKorean(value: number | null) {
  if (value === null || !Number.isInteger(value)) return "";
  if (value < 0) {
    return `-${Math.abs(value).toLocaleString("ko-KR")}원 (마이너스 ${formatKoreanWon(Math.abs(value)).replace(/원$/, "")}원)`;
  }
  return `${value.toLocaleString("ko-KR")}원 (${formatKoreanWon(value)})`;
}
