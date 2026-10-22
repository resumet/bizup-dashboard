import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { savePublicExternalMarketingInfo } from "./public-info-server";

const info = { courseName: "강의", instructorName: "강사", cohort: "2기", creativeDriveUrl: "https://drive.google.com/example", landingPages: [{ channel: "구글", url: "https://example.com" }] };
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
      async maybeSingle() { return { error: null, data: enabled ? { course_name: info.courseName, instructor_name: info.instructorName, cohort: info.cohort, creative_drive_url: info.creativeDriveUrl, landing_pages: info.landingPages } : null }; },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, filters, payload: () => payload };
}

test("공개 정보 수정은 공개 중인 토큰의 다섯 가지 정보만 저장한다", async () => {
  const f = fixture();
  assert.deepEqual(await savePublicExternalMarketingInfo(token, info, () => f.client), info);
  assert.deepEqual(f.filters, { public_token: token, public_enabled: true });
  assert.deepEqual(Object.keys(f.payload()!).sort(), ["cohort", "course_name", "creative_drive_url", "instructor_name", "landing_pages", "updated_at"]);
});

test("비활성화되거나 잘못된 토큰은 수정 결과를 반환하지 않는다", async () => {
  const f = fixture(false);
  assert.equal(await savePublicExternalMarketingInfo(token, info, () => f.client), null);
  assert.equal(await savePublicExternalMarketingInfo("bad-token", info, () => { throw new Error("잘못된 토큰은 DB에 접근하지 않아야 함"); }), null);
});

test("공개 화면에서 공개 상태·웨비나 날짜·예산을 덮어쓰거나 잘못된 URL을 저장할 수 없다", async () => {
  for (const extra of [{ publicEnabled: false }, { webinarDate: "2026-11-23" }, { totalBudget: 0 }, { creativeDriveUrl: "javascript:alert(1)" }]) {
    await assert.rejects(savePublicExternalMarketingInfo(token, { ...info, ...extra }, () => { throw new Error("검증 전에 DB에 접근하면 안 됨"); }), ZodError);
  }
});
