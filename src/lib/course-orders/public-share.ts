import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const UUID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/iu;
const SIGNATURE_PATTERN = /^[\da-f]{64}$/u;

export function createCourseRosterShareSignature(courseId: string, secret: string) {
  if (!UUID_PATTERN.test(courseId) || secret.length < 32) {
    throw new Error("수강생 명단 공유 설정이 올바르지 않습니다.");
  }
  return createHmac("sha256", secret).update(`course-roster:${courseId}`).digest("hex");
}

export function verifyCourseRosterShareSignature(courseId: string, signature: string, secret: string) {
  if (!UUID_PATTERN.test(courseId) || !SIGNATURE_PATTERN.test(signature) || secret.length < 32) return false;
  const expected = createCourseRosterShareSignature(courseId, secret);
  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function courseRosterSharePath(courseId: string, signature: string) {
  if (!UUID_PATTERN.test(courseId) || !SIGNATURE_PATTERN.test(signature)) throw new Error("공유 링크가 올바르지 않습니다.");
  return `/public/course-roster/${courseId}/${signature}`;
}

export function courseRosterShareTitle(instructorName: string, courseName: string) {
  const instructor = instructorName.normalize("NFKC").trim();
  const course = courseName.normalize("NFKC").trim();
  return `${instructor ? `${instructor} - ` : ""}${course || "강의"} 결제명단`;
}
