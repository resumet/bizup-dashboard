import assert from "node:assert/strict";
import test from "node:test";

import { summarizeCourseAdLeadCosts } from "./ad-performance-costs";

test("강의별 광고접수 DB 단가는 Google과 Meta를 각각 누적해 계산한다", () => {
  const result = summarizeCourseAdLeadCosts([
    { courseId: "course-a", googleSpend: 300_000, metaSpend: 200_000, googleAdLeads: 20, metaAdLeads: 10 },
    { courseId: "course-a", googleSpend: 100_000, metaSpend: 50_000, googleAdLeads: 5, metaAdLeads: 0 },
    { courseId: "course-b", googleSpend: 10_000, metaSpend: 0, googleAdLeads: 0, metaAdLeads: 2 },
  ]);

  assert.deepEqual(result.get("course-a"), {
    googleAdLeadCost: 16_000,
    metaAdLeadCost: 25_000,
  });
  assert.deepEqual(result.get("course-b"), {
    googleAdLeadCost: null,
    metaAdLeadCost: 0,
  });
});
