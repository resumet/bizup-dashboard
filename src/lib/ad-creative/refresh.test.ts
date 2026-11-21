import assert from "node:assert/strict";
import test from "node:test";
import { createClient } from "@supabase/supabase-js";
import { refreshCreativeData } from "./refresh";
import type { CreativeRow } from "./model";

const current = { spreadsheet_url: "https://docs.google.com/spreadsheets/d/test/edit", webinar_name: "saved filter", updated_at: "2026-11-21T00:00:00Z" };
const rows: CreativeRow[] = ["google", "meta"].map((platform, index) => ({
  platform: platform as CreativeRow["platform"], date: "2026-11-21", instructor: `teacher-${index}`,
  campaign: "campaign", group: "group", ad: "ad", status: "active", adType: "", cost: 100,
  impressions: 1000, clicks: 10, conversions: 1, webinar: "saved filter",
}));

function fixture(options: { missing?: boolean; conflict?: boolean; failDownload?: boolean } = {}) {
  const writes: Record<string, unknown>[] = [];
  const filters: URLSearchParams[] = [];
  const client = createClient("https://test.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.searchParams.get("workspace_id"), "eq.workspace-a");
      if (init?.method === "PATCH") {
        writes.push(JSON.parse(String(init.body)));
        filters.push(url.searchParams);
        return Response.json(options.conflict ? [] : [{ workspace_id: "workspace-a" }]);
      }
      return Response.json(options.missing ? [] : [current]);
    } },
  });
  return { writes, filters, dependencies: { client, loadSource: async (url: string, webinarName = "") => {
    assert.equal(url, current.spreadsheet_url);
    assert.equal(webinarName, current.webinar_name);
    if (options.failDownload) throw new Error("download failed");
    return { url, webinarName, rows };
  } } };
}

test("갱신은 저장된 설정으로 양 매체 전체 데이터를 가져오고 워크스페이스·수정 시각을 확인해 저장한다", async () => {
  const f = fixture();
  assert.deepEqual(await refreshCreativeData("workspace-a", "actor", f.dependencies), { rowCount: 2 });
  assert.deepEqual(f.writes[0].rows, rows);
  assert.equal(f.writes[0].updated_by, "actor");
  assert.equal(f.filters[0].get("updated_at"), `eq.${current.updated_at}`);
  assert.equal(f.writes[0].spreadsheet_url, undefined);
  assert.equal(f.writes[0].webinar_name, undefined);
});

test("설정 누락·다운로드 실패 시 기존 데이터를 덮어쓰지 않고 동시 수정 충돌은 성공으로 처리하지 않는다", async () => {
  for (const options of [{ missing: true }, { failDownload: true }]) {
    const f = fixture(options);
    await assert.rejects(refreshCreativeData("workspace-a", "actor", f.dependencies));
    assert.equal(f.writes.length, 0);
  }
  const f = fixture({ conflict: true });
  await assert.rejects(refreshCreativeData("workspace-a", "actor", f.dependencies), /설정이 변경/);
});
