import type { Answers, ImagePaths } from "./model";
import { FIELD_LABELS } from "./model";

type ExportNameInput = {
  instructorName: string;
  courseName: string;
};

export type InstructorIntakeExportNames = {
  archive: string;
  markdown: string;
  imagesFolder: string;
};

function safeFilePart(value: string, fallback: string) {
  const sanitized = value.trim()
    .replace(/[\\/:*?"<>|\u0000-\u001f]/gu, "-")
    .replace(/\s+/gu, " ")
    .replace(/[. ]+$/gu, "")
    .slice(0, 80);
  return sanitized || fallback;
}

export function instructorIntakeExportNames({ instructorName, courseName }: ExportNameInput): InstructorIntakeExportNames {
  const base = `${safeFilePart(instructorName, "강사")}-${safeFilePart(courseName, "강의")}-사전조사`;
  return {
    archive: `${base}.zip`,
    markdown: `${base}파일.md`,
    imagesFolder: `${base}-이미지`,
  };
}

function text(value: string | null | undefined) {
  return value?.trim() || "미입력";
}

function imageSummary(count: number) {
  return count > 0 ? `업로드된 이미지 ${count}개` : "미입력";
}

function urls(values: string[], unavailable: boolean) {
  if (unavailable) return "없음";
  return values.length ? values.map((value) => `- ${value}`).join("\n") : "미입력";
}

function won(value: number | null) {
  return value === null ? "미입력" : `${value.toLocaleString("ko-KR")}원`;
}

function evidenceAvailability(value: Answers["evidenceAvailability"]) {
  if (!value.length) return "미입력";
  return value.map((item, index) => [
    `${index + 1}. ${text(item.item)}`,
    `- 촬영·공개 가능: ${item.canShow === "yes" ? "O" : item.canShow === "no" ? "X" : "미입력"}`,
    `- 사전 준비: ${text(item.preparation)}`,
  ].join("\n")).join("\n\n");
}

function availableStudents(value: Answers) {
  const count = value.availableStudents === null ? "미입력" : `${value.availableStudents.toLocaleString("ko-KR")}명`;
  const students = value.availableStudentCandidates.length
    ? value.availableStudentCandidates.map((student, index) => `${index + 1}. 닉네임: ${text(student.nickname)}${student.name ? ` / 이름: ${student.name}` : ""}${student.phone ? ` / 휴대폰번호: ${student.phone}` : ""}`).join("\n")
    : "미입력";
  return `출연 가능한 수강생: ${count}\n${students}`;
}

export function instructorIntakeMarkdown(answers: Answers, photoCount: number, imagePaths: ImagePaths) {
  const values = [
    text(answers.realName), text(answers.nickname), text(answers.phone), text(answers.email), imageSummary(photoCount),
    text(answers.lectureItem), text(answers.courseContentIntroduction), text(answers.instructorCareer), imageSummary(imagePaths.evidence.length),
    `${text(answers.studentSuccessDescription)}\n\n${imageSummary(imagePaths.studentResults.length)}`, imageSummary(imagePaths.reviews.length),
    text(answers.differentiators), answers.webinarCoreContents.some(Boolean) ? answers.webinarCoreContents.map((value, index) => `${index + 1}. ${text(value)}`).join("\n") : "미입력",
    text(answers.fieldStrengths), text(answers.recommendedAudience), text(answers.webinarBenefits),
    `${text(answers.opportunityEvidence)}\n\n${imageSummary(imagePaths.opportunity.length)}`,
    answers.hasTeachingExperience === null ? "미입력" : answers.hasTeachingExperience ? `강의 경험 있음\n강의 횟수: ${answers.teachingCount ?? "미입력"}회\n누적 수강생: ${answers.studentCount ?? "미입력"}명` : "강의 경험 없음",
    urls(answers.materialsUrls, answers.materialsUnavailable), urls(answers.youtubeUrls, answers.youtubeUnavailable),
    won(answers.monthlyRevenue), won(answers.monthlyProfit), won(answers.expectedRevenue), won(answers.expectedProfit),
    won(answers.threeMonthExpectedRevenue), won(answers.threeMonthExpectedProfit),
    answers.studentSuccessRate === null ? "미입력" : `${answers.studentSuccessRate}%`, text(answers.studentFailureReasons), availableStudents(answers),
    `아이디: ${text(answers.instagramAccountId)}\n비밀번호: ${text(answers.instagramAccountPassword)}`,
    text(answers.blueBadge), text(answers.twoFactorSecurity),
    `아이디: ${text(answers.infokLinkId)}\n비밀번호: ${text(answers.infokLinkPassword)}`,
    `거주지: ${text(answers.residence)}\n촬영 가능 장소: ${text(answers.filmingLocations)}`,
    text(answers.careerAndFilmingMaterials), text(answers.practicalProcess), evidenceAvailability(answers.evidenceAvailability),
  ];

  return FIELD_LABELS.map((label, index) => `## ${index + 1}. ${label}\n\n${values[index] ?? "미입력"}`).join("\n\n") + "\n";
}
