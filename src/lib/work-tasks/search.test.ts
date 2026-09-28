import assert from "node:assert/strict";
import test from "node:test";

import { normalizeWorkSearch, workReportMatches, workTaskMatches } from "./search";
import type { WorkDailyReport, WorkTask } from "./types";

const task: WorkTask = {
  id: "task", title: "광고 성과 정리", description: "메타 보고서 확인", planned_date: "2026-09-28",
  status: "open", creator_id: "user", assignee_id: "user", completed_at: null,
  created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z",
};
const report: WorkDailyReport = {
  workspace_id: "workspace", user_id: "user", work_date: "2026-09-28", content: "유튜브 채널 분석을 마쳤습니다.",
  created_at: "2026-09-28T00:00:00Z", updated_at: "2026-09-28T00:00:00Z",
};

test("업무 검색은 제목, 설명과 담당자 이름을 찾는다", () => {
  assert.equal(workTaskMatches(task, "김지후", normalizeWorkSearch("성과")), true);
  assert.equal(workTaskMatches(task, "김지후", normalizeWorkSearch("메타")), true);
  assert.equal(workTaskMatches(task, "김지후", normalizeWorkSearch("지후")), true);
  assert.equal(workTaskMatches(task, "김지후", normalizeWorkSearch("유튜브")), false);
});

test("카드뷰 업무보고 검색은 본문과 작성자 이름을 찾는다", () => {
  assert.equal(workReportMatches(report, "김지후", normalizeWorkSearch("채널 분석")), true);
  assert.equal(workReportMatches(report, "김지후", normalizeWorkSearch("지후")), true);
  assert.equal(workReportMatches(report, "김지후", normalizeWorkSearch("광고")), false);
});
