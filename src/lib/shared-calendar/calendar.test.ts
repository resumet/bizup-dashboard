import assert from "node:assert/strict";
import test from "node:test";
import { DURATIONS, START_TIMES, eventSchema, formatDuration, formatEventTime, isDateKey, koreaToday, meetingTypeSchema, monthDays, shiftMonth } from "./calendar";
import { validateRange, parseVersion, readCalendarBody } from "./server";

const valid = { title: "강사 미팅", eventDate: "2026-10-08", startMinutes: 480, durationMinutes: 30, meetingTypeId: "00000000-0000-4000-8000-000000000001", courseId: null, notes: "" };

test("시작시간은 08:00~21:00, 30분 단위이며 경계 시간을 허용한다", () => {
  assert.equal(START_TIMES.length, 27);
  assert.equal(START_TIMES.at(-1), 1260);
  for (const startMinutes of START_TIMES) assert.ok(eventSchema.safeParse({ ...valid, startMinutes }).success);
  for (const startMinutes of [0, 450, 481, 500, 1270, 1290, "480", null]) assert.equal(eventSchema.safeParse({ ...valid, startMinutes }).success, false);
});
test("내부 Next.js 주소 대신 실제 호스트로 요청 출처를 검증한다", async () => {
  const request = (origin: string, contentType = "application/json") => new Request("http://localhost:3000/api/shared-calendar", { method: "POST", headers: { origin, "x-forwarded-host": "dashboard.example.com", "content-type": contentType }, body: JSON.stringify({ title: "test" }) });
  assert.deepEqual(await readCalendarBody(request("https://dashboard.example.com")), { title: "test" });
  await assert.rejects(() => readCalendarBody(request("https://attacker.invalid")), /다른 사이트/u);
  await assert.rejects(() => readCalendarBody(request("null")), /다른 사이트/u);
  await assert.rejects(() => readCalendarBody(request("https://dashboard.example.com", "text/plain")), /JSON/u);
});
test("소요시간은 30분~24시간의 30분 단위이며 종료시간을 계산한다", () => {
  for (const durationMinutes of DURATIONS) assert.ok(eventSchema.safeParse({ ...valid, durationMinutes }).success);
  for (const durationMinutes of [0, -30, 45, 1441, "60"]) assert.equal(eventSchema.safeParse({ ...valid, durationMinutes }).success, false);
  assert.equal(formatDuration(90), "1시간 30분");
  assert.equal(formatEventTime(1260, 240), "21:00~다음 날 01:00 (4시간)");
});
test("날짜는 실제 존재하는 날짜만 허용하며 한국 자정을 기준으로 계산한다", () => {
  assert.ok(isDateKey("2028-02-29"));
  for (const value of ["2026-02-29", "2026-02-30", "2026-13-01", "2026-1-1", "1999-12-31", "2101-01-01"]) assert.equal(isDateKey(value), false);
  assert.equal(koreaToday(new Date("2026-10-07T15:00:00Z")), "2026-10-08");
  assert.equal(koreaToday(new Date("2026-10-07T14:59:59Z")), "2026-10-07");
});
test("월 이동과 달력 날짜가 브라우저 시간대와 관계없이 일관적이다", () => {
  assert.equal(shiftMonth("2026-12", 1), "2027-01");
  assert.equal(shiftMonth("2026-01", -1), "2025-12");
  const days = monthDays("2026-10");
  assert.equal(days.length, 42);
  assert.equal(days[0], "2026-09-27");
  assert.equal(days[41], "2026-11-07");
});
test("빈 제목, 과도한 메모, 잘못된 강의/종류 ID를 거부하고 문자열을 정리한다", () => {
  assert.equal(eventSchema.parse({ ...valid, title: "  미팅  " }).title, "미팅");
  for (const change of [{ title: " " }, { title: "a".repeat(121) }, { notes: "a".repeat(2001) }, { courseId: "other" }, { meetingTypeId: "" }]) assert.equal(eventSchema.safeParse({ ...valid, ...change }).success, false);
});
test("관리자 회의 항목 이름과 충돌 버전/조회 기간을 검증한다", () => {
  assert.equal(meetingTypeSchema.parse({ name: "  워크숍  " }).name, "워크숍");
  assert.equal(meetingTypeSchema.safeParse({ name: " " }).success, false);
  assert.equal(meetingTypeSchema.safeParse({ name: "a".repeat(41) }).success, false);
  assert.equal(parseVersion({ version: 1 }), 1);
  assert.throws(() => parseVersion({ version: 0 }));
  assert.throws(() => parseVersion({ version: "1" }));
  assert.deepEqual(validateRange("2026-10-01", "2026-10-31"), { from: "2026-10-01", to: "2026-10-31" });
  assert.throws(() => validateRange("2026-11-01", "2026-10-01"));
  assert.throws(() => validateRange("2026-01-01", "2026-12-31"));
  assert.throws(() => validateRange(null, "2026-12-31"));
});
