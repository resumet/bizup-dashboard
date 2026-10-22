import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadWebinarPayments } from "./paid-roster";
import { loadWebinarRecord, listWebinarCourses } from "./server";
import { emptyWebinarMetrics, parseEditableWebinarMetrics, summarizeWebinars } from "./metrics";

function enrollment(id: string, phone: string, amount: string, extra: Record<string, unknown> = {}) {
  return { id, source_row_number: 1, normalized_phone: phone, normalized_values: {
    email: "", optionName: "기본반", paymentAmount: amount, ...extra,
  } };
}

function fixture() {
  const calls: { table: string; filters: Record<string, unknown>; range?: number[] }[] = [];
  const jobs = [{ id: "job-a", course_id: "a", latest_version: 24 }, { id: "job-b", course_id: "a", latest_version: 1 }];
  const rows: Record<string, ReturnType<typeof enrollment>[]> = {
    "job-a": [enrollment("1", "01011111111", "100000"), enrollment("2", "01011111111", "50000"),
      enrollment("3", "01022222222", "200000", { paymentMethod: "현금결제", hasDifferentStudent: true, studentPhone: "01099999999" }),
      enrollment("4", "01033333333", "900000", { refundedAt: "2026-10-22" })],
    "job-b": [enrollment("5", "01011111111", "25.5"), enrollment("6", "", "10", { email: "payer@example.com" })],
  };
  const saved = { ...emptyWebinarMetrics(), course_id: "a", group_chat_count: 100, live_peak_count: 80, payment_count: 999, revenue: 999, version: 5, updated_at: "saved" };
  const client = {
    from(table: string) {
      const call = { table, filters: {} as Record<string, unknown>, range: undefined as number[] | undefined };
      calls.push(call);
      const query = {
        select: () => query,
        eq: (key: string, value: unknown) => { call.filters[key] = value; return query; },
        in: (key: string, value: unknown) => { call.filters[key] = value; return query; },
        order: () => query,
        maybeSingle: async () => ({ data: saved, error: null }),
        range: async (start: number, end: number) => {
          call.range = [start, end];
          const data = table === "courses" ? [{ id: "a", name: "A", free_webinar_at: "2026-11-01", course_webinar_metrics: saved }, { id: "b", name: "B", free_webinar_at: "2026-11-02", course_webinar_metrics: null }]
            : table === "course_jobs" ? jobs.filter((job) => (call.filters.course_id as string[]).includes(job.course_id)) : rows[call.filters.job_id as string] ?? [];
          return { data: data.slice(start, end + 1), error: null };
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  return { client, rows, calls, saved };
}

test("웨비나 결제는 유료수강생과 동일하게 환불을 제외하고 결제자를 중복 제거하며 현금·대리수강 결제금액을 포함한다", async () => {
  const { client, calls } = fixture();
  const payments = await loadWebinarPayments(client, ["a", "b"]);
  assert.deepEqual(payments.get("a"), { payment_count: 3, revenue: 350035.5 });
  assert.deepEqual(payments.get("b"), { payment_count: 0, revenue: 0 });
  assert.deepEqual(calls.find((item) => item.table === "course_jobs")?.filters, { course_id: ["a", "b"], is_order_roster: true });
  assert.deepEqual(calls.filter((item) => item.table === "job_enrollments").map((item) => item.filters), [{ job_id: "job-a", version: 24 }, { job_id: "job-b", version: 1 }]);
});

test("웨비나 상세·목록 모두 과거 수기 결제값 대신 최신 명단을 반영하고 저장 버전을 보존한다", async () => {
  const { client } = fixture();
  const record = await loadWebinarRecord(client, "a");
  assert.equal(record.version, 5);
  assert.equal(record.group_chat_count, 100);
  assert.equal(record.payment_count, 3);
  assert.equal(record.revenue, 350035.5);
  const courses = await listWebinarCourses(client);
  assert.deepEqual(courses.map((item) => item.id), ["a", "b"]);
  assert.equal(courses[0].metrics?.payment_count, 3);
  assert.equal(courses[1].metrics?.version, 0);
  assert.equal(courses[1].metrics?.payment_count, 0);
  assert.equal(summarizeWebinars(courses).entered, 1);
});

test("명단이 1,000행을 넘어도 전체를 집계하며 빈 강의 목록은 조회하지 않는다", async () => {
  const { client, rows, calls } = fixture();
  rows["job-a"] = Array.from({ length: 1001 }, (_, i) => enrollment(`row-${i}`, `010${String(i).padStart(8, "0")}`, "100"));
  rows["job-b"] = [];
  const payment = (await loadWebinarPayments(client, ["a"])).get("a");
  assert.deepEqual(payment, { payment_count: 1001, revenue: 100100 });
  assert.ok(calls.some((item) => item.table === "job_enrollments" && item.range?.[0] === 1000));
  const count = calls.length;
  assert.equal((await loadWebinarPayments(client, [])).size, 0);
  assert.equal(calls.length, count);
});

test("자동 결제값은 저장 요청으로 덮어쓸 수 없고 소수 금액도 수동 입력 검증을 방해하지 않는다", () => {
  const metrics = parseEditableWebinarMetrics({ group_chat_count: "100", payment_count: "999", revenue: "350035.5" });
  assert.equal(metrics.payment_count, null);
  assert.equal(metrics.revenue, null);
  assert.equal(metrics.group_chat_count, 100);
  assert.throws(() => parseEditableWebinarMetrics(null));
  assert.throws(() => parseEditableWebinarMetrics({ group_chat_count: -1 }));
  assert.throws(() => parseEditableWebinarMetrics({ extra: 1 }));
});

test("결제 집계 조회 실패를 0명으로 숨기지 않는다", async () => {
  const client = { from: () => { const query = { select: () => query, in: () => query, eq: () => query, order: () => query, range: async () => ({ data: null, error: { code: "42501" } }) }; return query; } } as unknown as SupabaseClient;
  await assert.rejects(loadWebinarPayments(client, ["a"]), /42501/u);
});
