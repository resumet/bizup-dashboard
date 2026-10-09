import assert from "node:assert/strict";
import test from "node:test";
import { buildGoogleCalendarUrl } from "./google-calendar";
import type { CalendarEvent } from "./types";

const event: CalendarEvent = {
  id: "00000000-0000-4000-8000-000000000001", title: "강사 미팅 & 자료 + 확인 #1",
  event_date: "2026-10-09", start_minutes: 540, duration_minutes: 90,
  meeting_type_id: "00000000-0000-4000-8000-000000000002", course_id: null,
  notes: "접속: https://example.com/?a=1&b=2\n자료 확인", participant_ids: [],
  location_kind: "custom", location_text: "오산 스튜디오 & 2층", time_tbd: false, version: 1,
  meeting_type: { id: "00000000-0000-4000-8000-000000000002", name: "강사 줌미팅", code: "instructor_zoom" },
  course: { id: "00000000-0000-4000-8000-000000000003", name: "검증 강의", instructor_name: "김강사", cohort: null },
};

function calendar(overrides: Partial<CalendarEvent> = {}) {
  const chooser = new URL(buildGoogleCalendarUrl({ ...event, ...overrides }));
  assert.equal(chooser.origin, "https://accounts.google.com");
  assert.equal(chooser.pathname, "/AccountChooser");
  assert.equal(chooser.searchParams.get("service"), "cl");
  return new URL(chooser.searchParams.get("continue")!);
}

test("Google 계정을 선택한 뒤 저장된 일정의 제목·시간·장소·메모를 채운 작성창으로 이동한다", () => {
  const url = calendar();
  assert.equal(url.origin, "https://calendar.google.com");
  assert.equal(url.pathname, "/calendar/render");
  assert.equal(url.searchParams.get("action"), "TEMPLATE");
  assert.equal(url.searchParams.get("text"), event.title);
  assert.equal(url.searchParams.get("dates"), "20261009T090000/20261009T103000");
  assert.equal(url.searchParams.get("ctz"), "Asia/Seoul");
  assert.equal(url.searchParams.get("location"), event.location_text);
  assert.ok(url.searchParams.get("details")?.includes(event.notes));
  assert.ok(url.searchParams.get("details")?.includes("강의: 검증 강의 · 김강사"));
  assert.equal(url.searchParams.has("add"), false);
});

test("종료시간이 다음 날짜·월·연도로 넘어가는 일정도 한국시간으로 전달한다", () => {
  assert.equal(calendar({ event_date: "2026-12-31", start_minutes: 1260, duration_minutes: 1440 }).searchParams.get("dates"), "20261231T210000/20270101T210000");
  assert.equal(calendar({ event_date: "2028-02-29", start_minutes: 1260, duration_minutes: 240 }).searchParams.get("dates"), "20280229T210000/20280301T010000");
});

test("시간 미정은 종일 일정으로 보내며 설명에 예정 소요시간을 보존한다", () => {
  const url = calendar({ event_date: "2026-12-31", time_tbd: true });
  assert.equal(url.searchParams.get("dates"), "20261231/20270101");
  assert.ok(url.searchParams.get("details")?.includes("시간 미정 (예정 소요 1시간 30분)"));
});

test("온라인·장소미정과 연결 강의가 없는 일정을 처리한다", () => {
  assert.equal(calendar({ location_kind: "online", location_text: "" }).searchParams.get("location"), "온라인");
  const url = calendar({ location_kind: "tbd", location_text: "", course: null });
  assert.equal(url.searchParams.get("location"), "");
  assert.ok(url.searchParams.get("details")?.includes("장소: 장소미정"));
  assert.equal(url.searchParams.get("details")?.includes("강의:"), false);
});
