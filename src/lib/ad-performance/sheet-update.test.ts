import assert from "node:assert/strict";
import test from "node:test";
import { parseMeaningTrackingApplyList } from "@/lib/admin/meaning-tracking";
import { applyTrackingToSheet, compareSheetUpdates } from "./sheet-update";
import { createSheetUpdatePreview, sheetUpdateReviewResponse } from "./sheet-update-review";
import { buildAdPerformanceMetricSnapshot } from "./sheet-workspace";
import type { AdPerformanceSheetState } from "./types";

const header = ["신청일", "유입경로", "진행매체"];
function state(): AdPerformanceSheetState {
  return { spreadsheetId: "sheet", spreadsheetUrl: "", sheetName: "강의", sourceRows: [
    ["일자", "총광고비"], ["", ""],
    ...["2026-10-01", "2026-10-02", "2026-10-03"].map(date => [date, "300", "", "", "", "", "", "", "", "", "100", "200", "5", "10", "7", "8"]),
  ], tracking: null, trackingFileName: null, manualInputs: {
    "2026-10-01": { bizupDbCumulative: 99, chatMembersCumulative: 10 },
    "2026-10-02": { bizupDbCumulative: 100, chatMembersCumulative: 12 },
  }, version: 7, updatedAt: "" };
}
function parse(rows: string[][]) { return parseMeaningTrackingApplyList([header, ...rows], "2026-10-04"); }

test("과거 전체 광고 유입과 누적값을 재계산하고 파일에서 빠진 날짜는 0으로 반영한다", () => {
  const before = state();
  const original = structuredClone(before);
  const tracking = parse([
    ["2026-10-01", "그로스임팩트", "구글"], ["2026-10-01", "그로스임팩트", "메타"],
    ["2026-10-01", "채널A", "유튜브"], ["2026-10-03", "그로스임팩트", "구글"],
    ["2026-10-04", "그로스임팩트", "메타"],
  ]);
  const after = applyTrackingToSheet(before, tracking, "2026-10-01");
  assert.deepEqual(before, original);
  assert.equal(tracking.dailyByDate["10-02"], undefined);
  assert.deepEqual(after.manualInputs["2026-10-01"], { bizupDbCumulative: 3, chatMembersCumulative: 10 });
  assert.deepEqual(after.manualInputs["2026-10-02"], { bizupDbCumulative: 3, chatMembersCumulative: 12 });
  assert.equal(after.manualInputs["2026-10-03"].bizupDbCumulative, 4);
  const metrics = buildAdPerformanceMetricSnapshot({ ...after, dashboardStartDate: "2026-10-01", exclusiveEndDate: "2026-10-04" });
  assert.deepEqual(metrics.map(row => [row.googleLandingLeads, row.metaLandingLeads]), [[1, 1], [0, 0], [1, 0]]);
  const changes = compareSheetUpdates(before, after, "2026-10-01");
  assert.ok(changes.some(change => change.date === "2026-10-01" && change.field === "랜딩접수 DB · 구글" && change.before === 7 && change.after === 1));
  assert.ok(changes.some(change => change.date === "2026-10-02" && change.field === "누적비즈업 DB" && change.after === 3));
  assert.ok(!changes.some(change => change.field === "톡방누적 인원"));
  assert.deepEqual(compareSheetUpdates(after, structuredClone(after), "2026-10-01"), []);
});

test("신청 목록의 감소·매체 변경·채널 삭제도 과거 날짜에 반영한다", () => {
  const before = applyTrackingToSheet(state(), parse([
    ["2026-10-01", "그로스임팩트", "메타"], ["2026-10-01", "그로스임팩트", "메타"],
    ["2026-10-01", "이전채널", "유튜브"],
  ]), "2026-10-01");
  const after = applyTrackingToSheet(before, parse([["2026-10-01", "그로스임팩트", "구글"]]), "2026-10-01");
  const changes = compareSheetUpdates(before, after, "2026-10-01");
  assert.ok(changes.some(change => change.field === "랜딩접수 DB · 메타" && change.before === 2 && change.after === 0));
  assert.ok(changes.some(change => change.field === "오가닉 · 이전채널" && change.before === 1 && change.after === null));
  assert.equal(after.manualInputs["2026-10-03"].bizupDbCumulative, 1);
});

test("같은 월일의 다른 연도 데이터를 섞지 않는다", () => {
  const before = state();
  before.sourceRows = [...before.sourceRows.slice(0, 2), ["2025-10-01"], ["2026-10-01"]];
  const after = applyTrackingToSheet(before, parse([
    ["2025-10-01", "그로스임팩트", "메타"], ["2026-10-01", "그로스임팩트", "구글"],
    ["2025-10-01", "그로스임팩트", "메타"],
  ]), "2025-10-01");
  const rows = buildAdPerformanceMetricSnapshot({ ...after, dashboardStartDate: "2025-10-01", exclusiveEndDate: "2026-10-04" });
  assert.deepEqual(rows.map(row => [row.googleLandingLeads, row.metaLandingLeads]), [[0, 2], [1, 0]]);
});

test("미리보기는 쓰기 없이 응답하고 확인 토큰은 사용자·버전·파일·원본 변경을 구분한다", async () => {
  const current = state();
  const next = applyTrackingToSheet(current, parse([["2026-10-01", "그로스임팩트", "구글"]]), "2026-10-01");
  const input = { current, next, startDate: "2026-10-01", dashboardId: "dashboard", actorId: "user", fileDigest: "file1" };
  const preview = createSheetUpdatePreview(input);
  assert.equal(sheetUpdateReviewResponse(preview, { action: "preview" })?.status, 200);
  assert.equal(sheetUpdateReviewResponse(preview, { action: "confirm", ...preview }), null);
  for (const changed of [
    { ...input, current: { ...current, version: 8 } },
    { ...input, next: { ...next, sourceRows: [...next.sourceRows, ["2026-10-04", "100"]] } },
    { ...input, actorId: "someone-else" }, { ...input, fileDigest: "file2" },
  ]) {
    const updated = createSheetUpdatePreview(changed);
    const response = sheetUpdateReviewResponse(updated, { action: "confirm", ...preview });
    assert.equal(response?.status, 409);
    assert.equal((await response!.json()).preview.fingerprint, updated.fingerprint);
  }
});
