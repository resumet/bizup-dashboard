import assert from "node:assert/strict";
import test from "node:test";
import { applicantApplyUrl } from "./applicant-url";
import { updateDashboardSchema } from "./validation";

const base = "https://admin.systemnova.co.kr/free-courses/88b413ed-0ee1-4fd5-872d-b7ede9cb1f53";

test("신청자 링크는 끝 슬래시와 apply 유무에 관계없이 신청자 화면으로 연결한다", () => {
  for (const value of [base, `${base}/`, `${base}/apply`, `${base}/apply/`, ` ${base}/ `, `${base}/?page=2#top`]) {
    assert.equal(applicantApplyUrl(value), `${base}/apply`);
  }
});

test("잘못된 주소나 외부 도메인은 신청자 화면으로 열지 않는다", () => {
  for (const value of ["", "잘못된 주소", "javascript:alert(1)", base.replace("https:", "http:"), base.replace("admin.systemnova.co.kr", "example.com"), `${base}/other`, "https://admin.systemnova.co.kr/free-courses/", base.replace("https://", "https://user:pass@")]) {
    assert.equal(applicantApplyUrl(value), null);
  }
});

test("사전설정 링크 저장은 공백을 정리하고 삭제 및 기존 요청을 지원한다", () => {
  const settings = { courseId: "00000000-0000-4000-8000-000000000003", startDate: "2026-11-15", totalBudget: 0 };
  assert.equal(updateDashboardSchema.parse({ ...settings, applicantListUrl: ` ${base}/ ` }).applicantListUrl, `${base}/`);
  assert.equal(updateDashboardSchema.parse({ ...settings, applicantListUrl: " " }).applicantListUrl, "");
  assert.equal(updateDashboardSchema.parse(settings).applicantListUrl, undefined);
  assert.equal(updateDashboardSchema.safeParse({ ...settings, applicantListUrl: "javascript:alert(1)" }).success, false);
});
