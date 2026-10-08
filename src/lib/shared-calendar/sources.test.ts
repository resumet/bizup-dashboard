import assert from "node:assert/strict";
import test from "node:test";
import { leaveCalendarSources, webinarCalendarSource } from "./sources";

const course = { id: "00000000-0000-4000-8000-000000000021", name: "강의 A", instructor_name: "강사 A", cohort: "2기", free_webinar_at: "2026-10-11T15:30:00Z" };

test("웨비나 원본 시간을 한국 날짜·시간으로 표시하고 강의 상세에 연결한다", () => {
  const event = webinarCalendarSource(course)!;
  assert.equal(event.event_date, "2026-10-12");
  assert.equal(event.time_label, "00:30");
  assert.equal(event.start_minutes, 30);
  assert.equal(event.href, `/services/course-operations/${course.id}`);
  assert.equal(event.title, "웨비나 · 강의 A · 강사 A · 2기");
  assert.equal(event.id, `webinar:${course.id}`);
  assert.equal(webinarCalendarSource({ ...course, free_webinar_at: "2026-10-12T10:30:00Z" })!.time_label, "19:30");
});

test("날짜만 설정한 웨비나는 시간을 꾸며내지 않고 미정으로 표시한다", () => {
  const event = webinarCalendarSource({ ...course, cohort: null, free_webinar_at: "2026-10-11T15:00:00Z" })!;
  assert.equal(event.event_date, "2026-10-12");
  assert.equal(event.time_label, "시간 미정");
  assert.equal(event.start_minutes, 1440);
  for (const free_webinar_at of [null, "", "invalid", "1999-12-31T10:00:00Z"]) assert.equal(webinarCalendarSource({ ...course, free_webinar_at }), null);
});

test("승인된 활성 직원 휴가의 날짜·종일/반차만 공개하고 사유·검토 정보는 제외한다", () => {
  const people = [{ id: "staff", name: "직원 A", active: true }, { id: "disabled", name: "직원 B", active: false }];
  const events = leaveCalendarSources([
    ...(["full", "am", "pm"] as const).map((unit) => ({ id: unit, user_id: "staff", leave_date: "2026-10-12", unit, status: "approved", reason: "비공개 사유", review_note: "비공개 검토" })),
    ...["pending", "rejected", "cancelled"].map((status) => ({ id: status, user_id: "staff", leave_date: "2026-10-12", unit: "full" as const, status })),
    { id: "inactive", user_id: "disabled", leave_date: "2026-10-12", unit: "full", status: "approved" },
    { id: "outsider", user_id: "outsider", leave_date: "2026-10-12", unit: "full", status: "approved" },
    { id: "invalid", user_id: "staff", leave_date: "2026-02-30", unit: "full", status: "approved" },
  ], people);
  assert.deepEqual(events.map((event) => event.title), ["직원 A · 종일 휴가", "직원 A · 오전 반차", "직원 A · 오후 반차"]);
  assert.deepEqual(events.map((event) => event.start_minutes), [0, 0, 720]);
  assert.ok(events.every((event) => event.href === "/hr/leave?year=2026"));
  for (const event of events) assert.deepEqual(Object.keys(event).sort(), ["event_date", "href", "id", "source", "start_minutes", "time_label", "title"]);
  assert.ok(!JSON.stringify(events).includes("비공개"));
});
