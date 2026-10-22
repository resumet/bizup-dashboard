import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { savePublicExternalMarketingInfo } from "./public-info-server";
import { externalMarketingWbs } from "./wbs";

const info = { courseName: "강의", instructorName: "강사", cohort: "2기", webinarDate: "2026-11-23", creativeDriveUrl: "https://drive.google.com/example", landingPages: [{ channel: "구글", url: "https://example.com" }] };
const token = "a".repeat(48);
function fixture(enabled = true) {
  let payload: Record<string, unknown> | undefined;
  const filters: Record<string, unknown> = {};
  const client = { from(table: string) {
    assert.equal(table, "external_marketing_projects");
    const query = {
      update(value: Record<string, unknown>) { payload = value; return query; },
      eq(key: string, value: unknown) { filters[key] = value; return query; },
      select() { return query; },
      async maybeSingle() { return { error: null, data: enabled ? { course_name: payload?.course_name, instructor_name: payload?.instructor_name, cohort: payload?.cohort, webinar_date: payload?.webinar_date, creative_drive_url: payload?.creative_drive_url, landing_pages: payload?.landing_pages } : null }; },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, filters, payload: () => payload };
}

test("공개 정보 수정은 공개 중인 토큰의 웨비나 날짜를 저장하고 WBS 계산에 반영한다", async () => {
  const f = fixture();
  assert.deepEqual(await savePublicExternalMarketingInfo(token, info, () => f.client), info);
  assert.deepEqual(f.filters, { public_token: token, public_enabled: true });
  assert.deepEqual(Object.keys(f.payload()!).sort(), ["cohort", "course_name", "creative_drive_url", "instructor_name", "landing_pages", "updated_at", "webinar_date"]);
  const saved = await savePublicExternalMarketingInfo(token, { ...info, webinarDate: "2026-11-30" }, () => f.client);
  assert.equal(f.payload()!.webinar_date, "2026-11-30");
  assert.deepEqual(externalMarketingWbs(saved!.webinarDate, "2026-10-23").map((milestone) => milestone.dueDate), ["2026-11-09", "2026-11-02", "2026-10-26", "2026-10-24"]);
  assert.equal((await savePublicExternalMarketingInfo(token, { ...info, webinarDate: "" }, () => f.client))!.webinarDate, "");
  assert.equal(f.payload()!.webinar_date, null);
});

test("비활성화되거나 잘못된 토큰은 수정 결과를 반환하지 않는다", async () => {
  const f = fixture(false);
  assert.equal(await savePublicExternalMarketingInfo(token, info, () => f.client), null);
  assert.equal(await savePublicExternalMarketingInfo("bad-token", info, () => { throw new Error("잘못된 토큰은 DB에 접근하지 않아야 함"); }), null);
});

test("공개 화면에서 공개 상태·예산을 덮어쓰거나 잘못된 날짜·URL을 저장할 수 없다", async () => {
  for (const extra of [{ publicEnabled: false }, { webinarDate: "2026-02-30" }, { webinarDate: undefined }, { totalBudget: 0 }, { creativeDriveUrl: "javascript:alert(1)" }]) {
    await assert.rejects(savePublicExternalMarketingInfo(token, { ...info, ...extra }, () => { throw new Error("검증 전에 DB에 접근하면 안 됨"); }), ZodError);
  }
});
