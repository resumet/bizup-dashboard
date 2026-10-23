import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ZodError } from "zod";
import { savePublicExternalMarketingChatMembers, savePublicExternalMarketingInfo } from "./public-info-server";
import { externalMarketingWbs } from "./wbs";

const info = { courseName: "강의", instructorName: "강사", affiliateName: "관계사", projectManager: "담당PM", cohort: "2기", webinarDate: "2026-11-23", creativeDriveUrl: "https://drive.google.com/example", previousCohortCreativeNotionUrl: "https://app.notion.com/p/example", landingPages: [{ channel: "구글", url: "https://example.com" }] };
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
      async maybeSingle() { return { error: null, data: enabled ? { course_name: payload?.course_name, instructor_name: payload?.instructor_name, affiliate_name: payload?.affiliate_name, project_manager: payload?.project_manager, cohort: payload?.cohort, webinar_date: payload?.webinar_date, creative_drive_url: payload?.creative_drive_url, previous_cohort_creative_notion_url: payload?.previous_cohort_creative_notion_url, landing_pages: payload?.landing_pages } : null }; },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, filters, payload: () => payload };
}

test("공개 정보 수정은 공개 중인 토큰의 웨비나 날짜를 저장하고 WBS 계산에 반영한다", async () => {
  const f = fixture();
  assert.deepEqual(await savePublicExternalMarketingInfo(token, info, () => f.client), info);
  assert.deepEqual(f.filters, { public_token: token, public_enabled: true });
  assert.deepEqual(Object.keys(f.payload()!).sort(), ["affiliate_name", "cohort", "course_name", "creative_drive_url", "instructor_name", "landing_pages", "previous_cohort_creative_notion_url", "project_manager", "updated_at", "webinar_date"]);
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
  for (const extra of [{ publicEnabled: false }, { webinarDate: "2026-02-30" }, { webinarDate: undefined }, { totalBudget: 0 }, { creativeDriveUrl: "javascript:alert(1)" }, { previousCohortCreativeNotionUrl: "https://example.com/not-notion" }, { affiliateName: "가".repeat(121) }, { projectManager: "나".repeat(121) }]) {
    await assert.rejects(savePublicExternalMarketingInfo(token, { ...info, ...extra }, () => { throw new Error("검증 전에 DB에 접근하면 안 됨"); }), ZodError);
  }
});

test("공개 보고서의 날짜별 단톡방 누적 인원을 전용 RPC로 저장한다", async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return { data: 7, error: null };
    },
  } as unknown as SupabaseClient;

  assert.deepEqual(
    await savePublicExternalMarketingChatMembers(token, {
      metricDate: "2026-11-23",
      chatMembersCumulative: 120,
    }, () => client),
    { metricDate: "2026-11-23", chatMembersCumulative: 120, version: 7 },
  );
  assert.deepEqual(calls, [{
    name: "save_public_external_marketing_chat_members",
    args: {
      p_public_token: token,
      p_metric_date: "2026-11-23",
      p_chat_members_cumulative: 120,
    },
  }]);
});

test("단톡방 누적 인원 입력은 잘못된 토큰과 날짜·음수·추가 필드를 거부한다", async () => {
  assert.equal(await savePublicExternalMarketingChatMembers("bad-token", {
    metricDate: "2026-11-23",
    chatMembersCumulative: 1,
  }, () => { throw new Error("잘못된 토큰은 DB에 접근하지 않아야 함"); }), null);

  for (const input of [
    { metricDate: "2026-02-30", chatMembersCumulative: 1 },
    { metricDate: "2026-11-23", chatMembersCumulative: -1 },
    { metricDate: "2026-11-23", chatMembersCumulative: 1.5 },
    { metricDate: "2026-11-23", chatMembersCumulative: 1, publicEnabled: false },
  ]) {
    await assert.rejects(
      savePublicExternalMarketingChatMembers(token, input, () => { throw new Error("검증 전에 DB에 접근하면 안 됨"); }),
      ZodError,
    );
  }
});

test("비활성 공개 링크나 없는 날짜는 저장 결과를 반환하지 않는다", async () => {
  const client = {
    async rpc() { return { data: null, error: { code: "PT404" } }; },
  } as unknown as SupabaseClient;
  assert.equal(await savePublicExternalMarketingChatMembers(token, {
    metricDate: "2026-11-23",
    chatMembersCumulative: null,
  }, () => client), null);
});
