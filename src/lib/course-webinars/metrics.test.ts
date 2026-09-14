import assert from "node:assert/strict";
import test from "node:test";
import { emptyWebinarMetrics, parseWebinarMetrics, ratio, summarizeWebinars, type WebinarCourse } from "./metrics";

test("webinar inputs preserve missing versus zero, fractional hours and numeric limits", () => {
  assert.equal(parseWebinarMetrics({ ad_spend: "0", hours_to_peak: "1.5", revenue: "" }).ad_spend, 0);
  assert.equal(parseWebinarMetrics({ hours_to_peak: "1.5" }).hours_to_peak, 1.5);
  assert.equal(parseWebinarMetrics({}).revenue, null);
  for (const input of [{ payment_count: -1 }, { payment_count: 1.1 }, { payment_count: "1e3" }, { payment_count: true }, { hours_to_peak: 1.234 }, { ad_spend: Infinity }, { revenue: 1e13 }, { hours_to_peak: 1001 }, { extra: 1 }, { live_peak_count: 10, live_start_count: 11 }, { live_peak_count: 10, live_end_count: 11 }]) assert.throws(() => parseWebinarMetrics(input));
  assert.equal(parseWebinarMetrics({ live_peak_count: 100, live_start_count: 100, live_end_count: 0 }).live_end_count, 0);
});
test("conversion formulas and ROAS use explicit denominators without capping or dividing by zero", () => {
  assert.equal(ratio(200, 1000), 20);
  assert.equal(ratio(20, 200), 10);
  assert.equal(ratio(20, 1000), 2);
  assert.equal(ratio(5_000_000, 1_000_000), 500);
  assert.equal(ratio(0, 100), 0);
  assert.equal(ratio(100, 0), null);
  assert.equal(ratio(null, 100), null);
  assert.equal(ratio(100, null), null);
});
test("dashboard weights by audience totals and compares matched cohorts for partial records", () => {
  const course = (metrics: object): WebinarCourse => ({ id: "test", name: "강의", instructor_name: "강사", free_webinar_at: "2026-09-01T00:00:00Z", metrics: { ...emptyWebinarMetrics(), course_id: "test", version: 1, updated_at: "", ...metrics } });
  const result = summarizeWebinars([
    course({ group_chat_count: 100, live_start_count: 50, live_peak_count: 100, payment_count: 10, ad_spend: 100, revenue: 1000 }),
    course({ group_chat_count: 900, live_start_count: 90, live_peak_count: 180, payment_count: 9, ad_spend: 900, revenue: 900 }),
    course({ group_chat_count: 10000, revenue: 99999 }),
    { ...course({}), metrics: null },
  ]);
  assert.ok(Math.abs(result.ratios[0].value! - 14) < 1e-10); // Not mean(50%, 10%) and not divided by the incomplete course's 10,000.
  assert.equal(result.ratios[0].count, 2);
  assert.equal(result.ratios[1].value, 19 / 280 * 100);
  assert.equal(result.ratios[3].value, 190);
  assert.equal(result.totals.revenue, 101899);
  assert.equal(result.entered, 3);
  assert.equal(summarizeWebinars([]).totals.ad_spend, null);
  assert.equal(summarizeWebinars([]).ratios[0].value, null);
});

test("live-to-payment conversion requires peak audience and never falls back to starting audience", () => {
  const course = (metrics: object): WebinarCourse => ({ id: "test", name: "강의", instructor_name: "강사", free_webinar_at: "2026-09-01T00:00:00Z", metrics: { ...emptyWebinarMetrics(), course_id: "test", version: 1, updated_at: "", ...metrics } });
  const conversion = (courses: WebinarCourse[]) => summarizeWebinars(courses).ratios.find(item => item.key === "liveToPayment")!;
  assert.equal(conversion([course({ live_start_count: 40, live_peak_count: 100, payment_count: 20 })]).value, 20);
  assert.equal(conversion([course({ live_peak_count: 200, payment_count: 20 })]).value, 10);
  assert.equal(conversion([course({ live_start_count: 100, payment_count: 10 })]).value, null);
  assert.equal(conversion([course({ live_peak_count: 0, payment_count: 0 })]).value, null);
  const combined = conversion([course({ live_start_count: 40, live_peak_count: 100, payment_count: 20 }), course({ live_peak_count: 200, payment_count: 20 }), course({ live_start_count: 100, payment_count: 10 })]);
  assert.equal(combined.count, 2);
  assert.equal(combined.value, 40 / 300 * 100);
});
