import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadAdPerformanceBulk, readAllPerformanceRows } from "./bulk-server";

function fixture(failTable = "") {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul" }).format(new Date());
  const calls: { table: string; filters: Record<string, unknown>; fields: string }[] = [];
  const metric = { dashboard_id: "a", metric_date: "2020-01-01", google_impressions: 0, meta_impressions: 0, google_clicks: 0, meta_clicks: 0,
    google_ad_leads: 2, meta_ad_leads: 2, google_spend: 100, meta_spend: 100, google_landing_leads: 1, meta_landing_leads: 1, admin_cumulative_leads: 0, chat_room_members: 3 };
  const tables: Record<string, Record<string, unknown>[]> = {
    ad_performance_dashboards: [
      { id: "a", workspace_id: "w", service_scope: "bizup", course_id: "c", start_date: "2020-01-01", total_budget: 1000 },
      { id: "external", workspace_id: "w", service_scope: "external_marketing", course_id: null, start_date: "2020-01-01", total_budget: 0 },
      { id: "foreign", workspace_id: "other", service_scope: "bizup", course_id: "foreign-c", start_date: "2020-01-01", total_budget: 0 },
    ],
    courses: [
      { id: "c", workspace_id: "w", name: "강의", instructor_name: "강사", free_webinar_at: "2020-01-01" },
      { id: "foreign-c", workspace_id: "other", name: "타 워크스페이스", instructor_name: "강사", free_webinar_at: today },
    ],
    external_marketing_projects: [{ dashboard_id: "external", workspace_id: "w", course_name: "외부 강의", instructor_name: "외부 강사", cohort: "2기" }],
    ad_performance_dashboard_metrics: [metric, { ...metric, metric_date: today, google_spend: 999 }, { ...metric, dashboard_id: "foreign", google_spend: 999 }],
    ad_performance_organic_channels: [{ id: "ig", dashboard_id: "a", name: "인스타", sort_order: 0 }],
    ad_performance_organic_metric_values: [{ dashboard_id: "a", metric_date: "2020-01-01", channel_id: "ig", lead_count: 3 }],
    course_webinar_metrics: [{ course_id: "c", ad_spend: 200, group_chat_count: 4, live_peak_count: 2, payment_count: 999, revenue: 999999 }],
    course_jobs: [{ id: "job", course_id: "c", latest_version: 2, is_order_roster: true }],
    job_enrollments: [{ id: "payer", job_id: "job", version: 2, source_row_number: 1, normalized_phone: "01011111111", normalized_values: { paymentAmount: "1000", optionName: "기본반", email: "" } }],
  };
  const client = { from(table: string) {
    const call = { table, filters: {} as Record<string, unknown>, fields: "" };
    calls.push(call);
    const lessThan: Record<string, string> = {};
    const query = {
      select: (fields: string) => { call.fields = fields; return query; },
      eq: (key: string, value: unknown) => { call.filters[key] = value; return query; },
      in: (key: string, value: unknown) => { call.filters[key] = value; return query; },
      lt: (key: string, value: string) => { lessThan[key] = value; return query; },
      order: () => query,
      range: async (from: number, to: number) => ({
        error: table === failTable ? { code: "42501" } : null,
        data: (tables[table] ?? []).filter((row) => Object.entries(call.filters).every(([key, value]) => Array.isArray(value) ? value.includes(row[key]) : row[key] === value)
          && Object.entries(lessThan).every(([key, value]) => String(row[key]) < value)).slice(from, to + 1),
      }),
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, calls };
}

test("일괄 조회는 워크스페이스 범위를 유지하고 오늘 지표를 제외하며 실제 유료수강생 결제를 반영한다", async () => {
  const { client, calls } = fixture();
  const rows = await loadAdPerformanceBulk("w", client, client);
  assert.deepEqual(rows.map((row) => row.id), ["a"]);
  assert.equal(rows[0].values.spend, 200);
  assert.equal(rows[0].values.databaseLeads, 5);
  assert.equal(rows[0].values.payments, 1);
  assert.equal(rows[0].values.revenue, 1000);
  assert.equal(rows[0].values.livePeak, 2);
  assert.equal(calls.some((call) => call.table === "external_marketing_projects"), false);
  assert.equal(calls.find((call) => call.table === "ad_performance_dashboards")?.filters.service_scope, "bizup");
  for (const call of calls.filter((item) => ["courses", "ad_performance_dashboards", "external_marketing_projects"].includes(item.table))) assert.equal(call.filters.workspace_id, "w");
  for (const call of calls.filter((item) => item.table.startsWith("ad_performance_") && item.table !== "ad_performance_dashboards")) assert.deepEqual(call.filters.dashboard_id, ["a"]);
  assert.deepEqual(calls.find((call) => call.table === "course_webinar_metrics")?.filters.course_id, ["c"]);
  assert.ok(calls.every((call) => !call.fields.includes("token")));
});

test("명단 오류 시 과거 수기 결제 값으로 대체하지 않고 누락과 경고를 표시한다", async () => {
  const { client } = fixture("course_jobs");
  const [row] = await loadAdPerformanceBulk("w", client, client);
  assert.equal(row.values.payments, null);
  assert.equal(row.values.revenue, null);
  assert.equal(row.values.livePeak, 2);
  assert.match(row.error ?? "", /실적을 불러오지 못/u);
});

test("광고 지표 조회 실패를 빈 실적으로 숨기지 않는다", async () => {
  const { client } = fixture("ad_performance_dashboard_metrics");
  await assert.rejects(loadAdPerformanceBulk("w", client, client), /42501/u);
});

test("500건 이상 일괄 조회를 끝까지 순회한다", async () => {
  const rows = Array.from({ length: 1207 }, (_, id) => ({ id }));
  const ranges: number[][] = [];
  const result = await readAllPerformanceRows(async (from, to) => { ranges.push([from, to]); return { data: rows.slice(from, to + 1), error: null }; });
  assert.equal(result.length, 1207);
  assert.deepEqual(ranges, [[0, 499], [500, 999], [1000, 1499]]);
});
