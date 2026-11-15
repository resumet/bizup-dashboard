import assert from "node:assert/strict";
import test from "node:test";
import { parseMeaningTrackingApplyList } from "@/lib/admin/meaning-tracking";
import type { Applicant } from "@/lib/free-students/model";
import { trackingFromApplicants } from "./applicant-tracking";
import { applyTrackingToSheet } from "./sheet-update";
import { createSheetUpdatePreview, sheetUpdateReviewResponse } from "./sheet-update-review";
import type { AdPerformanceSheetState } from "./types";

function applicant(appliedAt: string, inflowPath: string, mediaChannel: string): Applicant {
  return { title: "강의", username: "테스트", email: "", phone: "", appliedAt, inflowPath, mediaChannel, isNewUser: false, createdAt: null, firstInflowFreeCourseTitle: null };
}

test("무료 신청자 명단은 한국 날짜로 변환한 기존 엑셀과 같은 유입·누적 DB를 계산한다", () => {
  const applicants = [
    applicant("2026-11-14T15:30:00Z", "그로스임팩트", "구글"),
    applicant("2026-11-15T05:00:00Z", "그로스임팩트", "메타"),
    applicant("2026-11-15T06:00:00Z", "채널A", "유튜브"),
    applicant("2026-11-15T07:00:00Z", "프로필", "인스타그램"),
    applicant("2026-11-15T08:00:00Z", "", ""),
    applicant("2026-11-15T15:00:00Z", "그로스임팩트", "구글"),
  ];
  const before = structuredClone(applicants);
  const expected = parseMeaningTrackingApplyList([
    ["신청일", "유입경로", "진행매체"],
    ["2026-11-15", "그로스임팩트", "구글"], ["2026-11-15", "그로스임팩트", "메타"],
    ["2026-11-15", "채널A", "유튜브"], ["2026-11-15", "프로필", "인스타그램"], ["2026-11-15", "", ""],
    ["2026-11-16", "그로스임팩트", "구글"],
  ], "2026-11-16");
  const tracking = trackingFromApplicants(applicants, "2026-11-16");
  assert.deepEqual(tracking, expected);
  assert.equal(tracking.bizupDbCumulativeCount, 5);
  assert.equal(tracking.dailyByDate["11-15"].googleLandingDb, 1);
  assert.equal(tracking.dailyByDate["11-15"].metaLandingDb, 1);
  assert.deepEqual(tracking.dailyByDate["11-15"].organicByChannel, { 채널A: 1, 인스타: 1, 경로불명: 1 });
  assert.deepEqual(applicants, before);
});

test("빈 명단도 과거 DB를 0으로 갱신하되 톡방 인원과 시트 비용을 보존한다", () => {
  const current: AdPerformanceSheetState = {
    spreadsheetUrl: "https://example.test", spreadsheetId: "sheet", sheetName: "강의", tracking: null, trackingFileName: "old.xlsx", version: 2, updatedAt: "",
    sourceRows: [["일자", "광고비"], ["", ""], ["2026-11-15", "500"]],
    manualInputs: { "2026-11-15": { bizupDbCumulative: 99, chatMembersCumulative: 20 } },
  };
  const next = applyTrackingToSheet({ ...current, trackingFileName: null }, trackingFromApplicants([], "2026-11-16"), "2026-11-01");
  assert.equal(next.manualInputs["2026-11-15"].bizupDbCumulative, 0);
  assert.equal(next.manualInputs["2026-11-15"].chatMembersCumulative, 20);
  assert.equal(next.sourceRows[2][1], "500");
  assert.equal(next.trackingFileName, null);
  const preview = createSheetUpdatePreview({ current, next, startDate: "2026-11-01", dashboardId: "dashboard", actorId: "user" });
  assert.ok(preview.changes.some(change => change.field === "누적비즈업 DB" && change.after === 0));
  assert.equal(sheetUpdateReviewResponse(preview, { action: "confirm", version: 1, fingerprint: preview.fingerprint })?.status, 409);
  assert.equal(sheetUpdateReviewResponse(preview, { action: "confirm", version: 2, fingerprint: preview.fingerprint }), null);
});

test("잘못된 신청일은 일부 명단으로 집계하지 않고 중단한다", () => {
  assert.throws(() => trackingFromApplicants([applicant("bad-date", "", "")]), /신청일/);
});
