import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadComparisonMonths } from "./comparison-source";

test("기존 스냅샷은 저장된 원본에서 ID를 복구하되 DB를 수정하지 않는다", async () => {
  const bytes = await readFile("docs/비즈업클래스_26.06_v2.xlsx");
  let downloads = 0;
  const upload = { original_filename: "비즈업클래스_26.06_v2.xlsx", storage_path: "source.xlsx", analysis_snapshot: null as unknown };
  const builder = { select: () => builder, eq: () => builder, order: () => builder, range: async () => ({ data: [upload], error: null }) };
  const client = { from: () => builder, storage: { from: () => ({ download: async () => { downloads++; return { data: new Blob([bytes]), error: null }; } }) } } as unknown as SupabaseClient;
  const months = await loadComparisonMonths(client, "project");
  assert.equal(downloads, 1);
  assert.ok(Object.values(months[0].detailsByInstructor).some(detail => detail.toss.some(row => row.orderNumber)));
  upload.analysis_snapshot = months[0];
  await loadComparisonMonths(client, "project");
  assert.equal(downloads, 1);
  const legacy = structuredClone(months[0]);
  for (const detail of Object.values(legacy.detailsByInstructor)) {
    for (const row of detail.toss) {
      delete row.orderNumber;
      Object.assign(row, { buyerId: "legacy-j-column" });
    }
  }
  upload.analysis_snapshot = legacy;
  const refreshed = await loadComparisonMonths(client, "project");
  assert.equal(downloads, 2);
  assert.ok(Object.values(refreshed[0].detailsByInstructor).some(detail => detail.toss.some(row => row.orderNumber)));
  upload.analysis_snapshot = null;
  upload.storage_path = "";
  await assert.rejects(loadComparisonMonths(client, "project"), /원본 엑셀이 없습니다/);
});
