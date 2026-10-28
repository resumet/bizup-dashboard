import { z } from "zod";

export const PHOTO_BUCKET = "instructor-profile-photos";
export const MAX_PHOTOS = 5;
export const MAX_MATERIAL_IMAGES = 10;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const tokenSchema = z.string().regex(/^[a-f0-9]{48}$/);
const text = (max: number) => z.string().trim().max(max);
const longText = text(12_000);
const count = z.number().int().min(1).max(1_000_000).nullable();
const money = z.number().int().min(0).max(1_000_000_000_000).nullable();
const profit = z.number().int().min(-1_000_000_000_000).max(1_000_000_000_000).nullable();
const url = z.string().trim().max(2000).url("올바른 URL을 입력해 주세요.").refine((value) => {
  try {
    const parsed = new URL(value);
    return ["https:", "http:"].includes(parsed.protocol) && !parsed.username && !parsed.password;
  } catch { return false; }
}, "http 또는 https URL을 입력해 주세요.");
const youtube = url.refine((value) => {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "youtu.be" || host === "youtube.com" || host.endsWith(".youtube.com");
  } catch { return false; }
}, "유튜브 영상 URL을 입력해 주세요.");

export const materialImageCategorySchema = z.enum(["evidence", "studentResults", "reviews", "opportunity"]);
export type MaterialImageCategory = z.infer<typeof materialImageCategorySchema>;
export const MATERIAL_IMAGE_LABELS: Record<MaterialImageCategory, string> = {
  evidence: "증빙 자료",
  studentResults: "수강생 성과 인증 자료",
  reviews: "수강후기",
  opportunity: "기회 증거 자료",
};
export const imagePathsSchema = z.object({
  evidence: z.array(z.string().max(500)).max(MAX_MATERIAL_IMAGES),
  studentResults: z.array(z.string().max(500)).max(MAX_MATERIAL_IMAGES),
  reviews: z.array(z.string().max(500)).max(MAX_MATERIAL_IMAGES),
  opportunity: z.array(z.string().max(500)).max(MAX_MATERIAL_IMAGES),
});
export type ImagePaths = z.infer<typeof imagePathsSchema>;
export const EMPTY_IMAGE_PATHS: ImagePaths = { evidence: [], studentResults: [], reviews: [], opportunity: [] };

export const DEFAULT_INTAKE_EXAMPLES = {
  lectureItemExamples: [
    "한 달 월급으로 시작하는 소액 부동산 월세 만들기",
    "초보자도 따라 하는 AI 인플루언서 수익화",
    "직장인을 위한 주말 온라인 쇼핑몰 자동화",
  ],
  courseContentIntroduction: `내가 월세를 받을 수 있을까?
많은 돈이 필요한 거 아니야?
월세 받은데, 내가 신경써야 하는 부분이 많은 거 아닐까?
나는 시간이 없어서 못해
나는 직장인이라서 못해
맞벌이 부부라서 시간이 없어
노후 걱정에 불안해요
나는 아직 직장 초년생이라 할 줄아는게 없어요

이런 분들 주목~!

대한민국 근로 기준법, 여러분의 월급은 안녕 하신가요?

한달 월급만 아껴도 여러분은 월세를 받는 주인공이 될 수 있습니다
안 될꺼야가 아니라 안할 꺼야 라는 말입니다
누구나 도전하면, 시작할 수 있습니다`,
  instructorCareer: `평범한 물리치료사라는 직장인 맞벌이 부부
아무것도 이룬것이 없었던 40을 기다리고 있던 어느날
이래선 안되겠다다
미친듯이 바꾸고 싶었다
3개월만에 온라인으로 공인중개사 자격증 획득
요가 , 필라테스 강사 취득
퇴사 후 초,중, 고 체험 교사로 활동
서울 25개구를 발로 투어
부동산 상승기에 전국에 투자
부동산 강사로 요청됨
유투버로 활동 요청도 들어옴
현 부동산 투자자, 강사,공인중개사로 활동하면서 주변 지인들의 인생의 전환점을 만들어줌
수강생들 청약 당첨, 수강생 부동산 내집마련과 함께 수익 상승
메디컬 빌딩 매각
수강생 꼬마빌딩 수익화 진행 중..
(특히 강조하고 싶은 이력이 있다면 함께 작성해주세요)`,
  differentiators: `코칭권을 신청하시는 경우 현장 임장 수업:
실제 부동산 현장을 직접 방문하며 실전 경험을 쌓을 수 있는 기회 제공`,
  studentSuccessDescription: `여러분의 포트폴리오 제가 만들어 드립니다
부동산 자산에 있어서 만큼은 ..
많은 돈이 필요하다 생각하시죠?
아닙니다
여러분의 생각과 실천이 바로 여러분의 미래의 돈입니다~!
생각이 행동이 바뀌지 않으면, 아무일도 일어나지 않습니다

아인슈타인이 말했죠?

어제와 똑같이 오늘을 살면서, 멋진 미래가 오길 바라는게 진짜 미친 거라고

네 여러분은 저를 만나기 전과 후로 나뉠 것입니다

여러분의 생각이 돈으로 바뀔 겁니다

한걸음 부터 시작하면, 됩니다
월급 300아끼고 안 쓴다고 달라지지 않습니다
하지만, 여러분이 노력한 300만원이 월세 300만원을 만들어 줄 것입니다

여러분의 씨드머니, 한달 월급이면, 충분합니다`,
  webinarCoreContents: [
    "소액으로 시작할 수 있는 현실적인 첫 단계",
    "초보자가 가장 많이 실수하는 지점과 해결 방법",
    "실제 수익화 사례와 적용 과정",
    "리스크를 줄이는 실행 체크리스트",
    "웨비나 직후 바로 실천할 수 있는 액션 플랜",
  ],
  fieldStrengths: `초기 투자비용이 낮음, 수익 창출이 빠름, 리스크가 적음
안정적인 수익: 부동산은 안정적인 자산으로, 월세 등 지속적인 수익을 기대할 수 있습니다.
리스크 관리 용이: 어플을 통한 숙박 시장에도 진입이 가능합니다.
소액으로 꾸준하게 들어오는 월세를 만들 수 있습니다.
시장 변동성에 덜 민감: K-문화에 대한 기대감으로 매년 증가하고 있습니다. 코로나 이후 훨씬 더 활발해진 여행 문화가 자리잡아 가고 있습니다.
기존 모텔이나 숙박시설의 개념을 벗어난 개성을 연출할 수 있습니다.`,
  recommendedAudience: `- 시간 없는 직장인을 위한 N잡 투자, 월급만큼 월세 받기
- 소자본으로 내 집 마련을 꿈꾸는 직장인
- 부동산 전반에 대한 통찰력을 키우고 싶은 초보자
- 은퇴 후 월세 소득을 만들고 싶은 투자자
- 취준생도 할 수 있다`,
  webinarBenefits: `- 무료 웨비나 핵심 내용을 정리한 PDF
- 바로 실행할 수 있는 체크리스트
- 웨비나 참여자 전용 상담 또는 수강 혜택`,
  opportunityEvidence: `돈 많은 사람만 월세를 받을 수 있을 거라는 생각
내 건물에서만 월세 수익을 창출해야 된다는 생각의 전환

지금까지는 영업신고증 없이 에어비앤비 사이트를 통해 숙박에 관한 등록을 할 수 있었습니다.
하지만 올해부터는 바뀝니다.
영업신고증 있는 사람과 없는 사람의 차이가 있습니다.
에어비앤비 게스트 수익률이 높은 만큼 정상적으로 신고하지 않은 분들은 퇴출됩니다.

내년부터는 오히려 가격을 상승하여 월세를 더 받을 수 있지 않을까라는 생각을 해 봅니다.
좋은 매물을 구해서 월세 만들고 내 집 마련, 건물주까지 달려 봅시다.
화이팅~!`,
};
export const intakeExamplesSchema = z.object({
  lectureItemExamples: z.array(text(300)).min(1).max(10),
  courseContentIntroduction: longText,
  instructorCareer: longText,
  differentiators: longText,
  studentSuccessDescription: longText,
  webinarCoreContents: z.array(text(1000)).length(5),
  fieldStrengths: longText,
  recommendedAudience: longText,
  webinarBenefits: longText,
  opportunityEvidence: longText,
});
export type IntakeExamples = z.infer<typeof intakeExamplesSchema>;
export const intakeSettingsSchema = z.object({ examples: intakeExamplesSchema, exampleImagePaths: imagePathsSchema });
export type IntakeSettings = z.infer<typeof intakeSettingsSchema>;
export const DEFAULT_INTAKE_SETTINGS: IntakeSettings = { examples: DEFAULT_INTAKE_EXAMPLES, exampleImagePaths: EMPTY_IMAGE_PATHS };

export const answersSchema = z.object({
  realName: text(80), nickname: text(80), lectureItem: text(3000),
  courseContentIntroduction: longText, instructorCareer: longText,
  studentSuccessDescription: longText, differentiators: longText,
  webinarCoreContents: z.array(text(1000)).max(5), fieldStrengths: longText,
  recommendedAudience: longText, webinarBenefits: longText, opportunityEvidence: longText,
  hasTeachingExperience: z.boolean().nullable(), teachingCount: count, studentCount: count,
  materialsUrls: z.array(url).max(10), materialsUnavailable: z.boolean(),
  youtubeUrls: z.array(youtube).max(10), youtubeUnavailable: z.boolean(),
  monthlyRevenue: money, monthlyProfit: profit, expectedRevenue: money, expectedProfit: profit,
  availableStudents: z.number().int().min(3, "출연 가능한 수강생은 최소 3명이어야 합니다.").max(100_000).nullable(),
  instagramAccountId: text(200), instagramAccountPassword: text(500), blueBadge: text(1000),
  twoFactorSecurity: text(1000), infokLinkId: text(200), infokLinkPassword: text(500),
}).superRefine((value, context) => {
  if (value.materialsUnavailable && value.materialsUrls.length) context.addIssue({ code: "custom", path: ["materialsUrls"], message: "자료가 없으면 자료 URL을 비워 주세요." });
  if (value.youtubeUnavailable && value.youtubeUrls.length) context.addIssue({ code: "custom", path: ["youtubeUrls"], message: "출연 영상이 없으면 영상 URL을 비워 주세요." });
}).transform((value) => value.hasTeachingExperience === false ? { ...value, teachingCount: null, studentCount: null } : value);

export type Answers = z.infer<typeof answersSchema>;
export type Photo = { path: string; url: string; downloadUrl?: string };
export type ImagePhotos = Record<MaterialImageCategory, Photo[]>;
export const EMPTY_ANSWERS: Answers = {
  realName: "", nickname: "", lectureItem: "", courseContentIntroduction: "", instructorCareer: "",
  studentSuccessDescription: "", differentiators: "", webinarCoreContents: ["", "", "", "", ""],
  fieldStrengths: "", recommendedAudience: "", webinarBenefits: "", opportunityEvidence: "",
  hasTeachingExperience: null, teachingCount: null, studentCount: null,
  materialsUrls: [], materialsUnavailable: false, youtubeUrls: [], youtubeUnavailable: false,
  monthlyRevenue: null, monthlyProfit: null, expectedRevenue: null, expectedProfit: null, availableStudents: null,
  instagramAccountId: "", instagramAccountPassword: "", blueBadge: "", twoFactorSecurity: "", infokLinkId: "", infokLinkPassword: "",
};
export const FIELD_LABELS = [
  "본명", "닉네임", "프로필 사진", "강의아이템 한줄소개", "강의 내용 소개", "강사 이력",
  "증빙을 위한 자료 제출", "수강생 성과 인증 자료", "수강후기", "강의 차별점",
  "무료 웨비나 핵심 내용", "해당 분야 특장점", "강의 추천 대상", "무료 웨비나 수강 혜택",
  "지금이 기회라는 정량적·정성적 증거", "기존 강의 경험", "기존 강의 자료·무료강의 영상",
  "유튜브 출연 영상", "강의 외 월 매출", "월 순이익", "수강 후 3개월 내 예상 매출·순이익",
  "무료강의 출연 가능 수강생", "인스타 신규계정 생성후 아이디, 비밀번호", "블루뱃지", "2차 보안", "인포크 링크 아이디, 비밀번호",
];
export const FIELD_DESCRIPTION_LINKS: Record<number, string> = {
  22: "https://possible-louse-74d.notion.site/3a1119af8a6780269985c82c7858b6d0?source=copy_link",
  23: "https://possible-louse-74d.notion.site/351119af8a67816e8541d52127fef714?source=copy_link",
  24: "https://possible-louse-74d.notion.site/2-11f119af8a67801da281cae674857bab?source=copy_link",
  25: "https://possible-louse-74d.notion.site/351119af8a6781a49e9ec97fd1b073e5?source=copy_link",
};
export function intakeProgress(answers: Answers, photoCount: number, imagePaths: ImagePaths = EMPTY_IMAGE_PATHS) {
  const completed = [
    !!answers.realName, !!answers.nickname, photoCount > 0, !!answers.lectureItem,
    !!answers.courseContentIntroduction, !!answers.instructorCareer, imagePaths.evidence.length > 0,
    !!answers.studentSuccessDescription && imagePaths.studentResults.length > 0, imagePaths.reviews.length > 0,
    !!answers.differentiators, answers.webinarCoreContents.length === 5 && answers.webinarCoreContents.every(Boolean),
    !!answers.fieldStrengths, !!answers.recommendedAudience, !!answers.webinarBenefits,
    !!answers.opportunityEvidence && imagePaths.opportunity.length > 0,
    answers.hasTeachingExperience === false || (answers.hasTeachingExperience === true && answers.teachingCount !== null && answers.studentCount !== null),
    answers.materialsUnavailable || answers.materialsUrls.length > 0,
    answers.youtubeUnavailable || answers.youtubeUrls.length > 0,
    answers.monthlyRevenue !== null, answers.monthlyProfit !== null,
    answers.expectedRevenue !== null && answers.expectedProfit !== null,
    answers.availableStudents !== null && answers.availableStudents >= 3,
    !!answers.instagramAccountId && !!answers.instagramAccountPassword,
    !!answers.blueBadge, !!answers.twoFactorSecurity, !!answers.infokLinkId && !!answers.infokLinkPassword,
  ];
  const received = completed.filter(Boolean).length;
  return { completed, received, total: completed.length, percent: Math.round((received / completed.length) * 100) };
}
export const saveSchema = z.object({
  answers: answersSchema,
  photoPaths: z.array(z.string().max(500)).max(MAX_PHOTOS), imagePaths: imagePathsSchema,
  revision: z.number().int().min(0), submit: z.boolean(),
}).superRefine((value, context) => {
  const allPaths = [...value.photoPaths, ...Object.values(value.imagePaths).flat()];
  if (new Set(allPaths).size !== allPaths.length) context.addIssue({ code: "custom", message: "중복된 사진이 포함되어 있습니다." });
  if (value.submit) {
    const progress = intakeProgress(value.answers, value.photoPaths.length, value.imagePaths);
    if (progress.received !== progress.total) context.addIssue({ code: "custom", message: `제출 전에 다음 항목을 입력해 주세요: ${FIELD_LABELS.filter((_, index) => !progress.completed[index]).join(", ")}` });
  }
});
export const createIntakeSchema = z.object({ courseId: z.string().uuid("기존 강의를 선택해 주세요.") });

const koreanDigits = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
const koreanSmallUnits = ["", "십", "백", "천"];
const koreanLargeUnits = ["", "만", "억", "조"];
function koreanChunk(value: number) {
  let result = "";
  const digits = String(value).padStart(4, "0");
  for (let index = 0; index < 4; index += 1) {
    const digit = Number(digits[index]);
    if (digit) result += `${digit === 1 && index < 3 ? "" : koreanDigits[digit]}${koreanSmallUnits[3 - index]}`;
  }
  return result;
}
export function formatKoreanWon(value: number | null) {
  if (value === null || !Number.isInteger(value) || value < 0) return "";
  if (value === 0) return "영원";
  let rest = value, unitIndex = 0;
  const chunks: string[] = [];
  while (rest > 0) {
    const chunk = rest % 10_000;
    if (chunk) chunks.unshift(`${koreanChunk(chunk)}${koreanLargeUnits[unitIndex]}`);
    rest = Math.floor(rest / 10_000); unitIndex += 1;
  }
  return `${chunks.join("")}원`;
}
export function formatWonWithKorean(value: number | null) {
  if (value === null || !Number.isInteger(value)) return "";
  if (value < 0) return `-${Math.abs(value).toLocaleString("ko-KR")}원 (마이너스 ${formatKoreanWon(Math.abs(value)).replace(/원$/, "")}원)`;
  return `${value.toLocaleString("ko-KR")}원 (${formatKoreanWon(value)})`;
}
