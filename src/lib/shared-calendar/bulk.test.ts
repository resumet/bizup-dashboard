import assert from "node:assert/strict";
import test from "node:test";
import { bulkImportSchema, bulkRowPayload, parseBulkTime, parseCalendarBulk } from "./bulk";
import type { CalendarPerson, MeetingType } from "./types";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const types: MeetingType[] = [{ id: id(1), name: "강사 줌미팅", code: "instructor_zoom" }, { id: id(2), name: "주간회의", code: "weekly_meeting" }];
const people: CalendarPerson[] = ["이지선", "윤지혜", "맹예진", "채문기"].map((name, index) => ({ id: id(index + 11), name, active: true }));
export const BULK_SAMPLE = `날짜 / 시간 / 구분 / 대상자 / 장소 / 참여 인원
1. 10월 12일(월) / 오전 11시 / 줌 미팅 / 신예영 / 온라인 / 전원
2. 10월 12일(월) / 오후 3시 / 줌 미팅 / 신민철 / 온라인 / 전원
3. 10월 15일(목) / 오후 1시 / 릴스 촬영 / 김선아 / 오산 / 이지선, 윤지혜
4. 10월 16일(금) / 오후 1시 / 릴스 촬영 / 신민철 / 강남 / 이지선, 윤지혜
5. 10월 20일(화) / 오후 2시 / 광고 촬영 / 김선아 / 장소 미정 / 맹예진, 채문기
6. 10월 21일(수) / 오후 2시 / 광고 촬영 / 신민철 / 장소 미정 / 맹예진, 채문기
7. 10월 21일(수) / 시간 미정 / 릴스 촬영 / 김해준 / 장소 미정 / 이지선, 윤지혜
8. 10월 23일(금) / 오전 9시~12시 / 릴스 촬영 / 신예영 / 수서 / 이지선, 윤지혜
9. 10월 23일(금) / 오후 2시~5~6시 / 광고 촬영 / 신예영 / 장소 미정 / 맹예진
10. 10월 29일(목) / 시간 미정 / 광고 촬영 / 김해준 / 장소 미정 / 맹예진`;

test("사용자의 예시 10개에서 날짜·종류·대상·장소·참여자를 정확히 해석한다", () => {
  const { rows, errors } = parseCalendarBulk(BULK_SAMPLE, 2026, types, people);
  assert.deepEqual(errors, []); assert.equal(rows.length, 10);
  assert.equal(rows[0].draft.eventDate, "2026-10-12"); assert.equal(rows[0].draft.startMinutes, 660);
  assert.equal(rows[1].draft.startMinutes, 900); assert.equal(rows[0].draft.durationMinutes, 60);
  assert.equal(rows[0].draft.meetingTypeId, types[0].id); assert.equal(rows[0].newMeetingTypeName, null);
  assert.equal(rows[2].newMeetingTypeName, "릴스 촬영"); assert.equal(rows[4].newMeetingTypeName, "광고 촬영");
  assert.equal(rows[2].draft.title, "릴스 촬영 · 김선아"); assert.ok(rows[2].draft.notes.includes("대상자: 김선아"));
  assert.equal(rows[0].draft.locationKind, "online"); assert.equal(rows[2].draft.locationKind, "custom"); assert.equal(rows[2].draft.locationText, "오산");
  assert.equal(rows[4].draft.locationKind, "tbd"); assert.equal(rows[4].draft.locationText, "");
  assert.deepEqual(rows[0].draft.participantIds, people.map((person) => person.id));
  assert.deepEqual(rows[2].draft.participantIds, people.slice(0, 2).map((person) => person.id));
  assert.deepEqual(rows[4].draft.participantIds, people.slice(2, 4).map((person) => person.id));
  assert.equal(rows[6].draft.timeTbd, true); assert.equal(rows[9].draft.timeTbd, true);
  assert.equal(rows[7].draft.startMinutes, 540); assert.equal(rows[7].draft.durationMinutes, 180);
  assert.deepEqual(rows[8].endOptions, [{ label: "17:00", durationMinutes: 180 }, { label: "18:00", durationMinutes: 240 }]);
  assert.ok(rows[8].issues.time); assert.ok(rows.every((row) => !row.issues.date && !row.issues.participants));
});

test("정확한 30분 시간과 시간 미정을 허용하고 잘못된/모호한 시간을 임의 확정하지 않는다", () => {
  for (const [time, start, duration] of [["오후 2시 반", 870, 60], ["오전 9시~12시", 540, 180], ["오후 2시~5시", 840, 180], ["14:30~16:00", 870, 90], ["오후 9시~오전 1시", 1260, 240], ["오후 2시~24:00", 840, 600]] as const) {
    const parsed = parseBulkTime(time); assert.equal(parsed.startMinutes, start, time); assert.equal(parsed.durationMinutes, duration, time); assert.equal(parsed.issue, undefined, time);
  }
  assert.equal(parseBulkTime("시간 미정").timeTbd, true);
  for (const time of ["오전 7시", "오후 10시", "11시 15분", "14:45", "오후 2시~종료 미정", "오후 2시~24:30", "오후 2시~5~6시"]) assert.ok(parseBulkTime(time).issue, time);
});

test("이름을 찾지 못하거나 동명이인이 있으면 수동 확인을 요구하고 전원은 활성 사용자만 선택한다", () => {
  const roster = [...people, { id: id(20), name: "이지선", active: true }, { id: id(21), name: "비활성", active: false }];
  const parse = (names: string) => parseCalendarBulk(`10월 12일(월) / 11시 / 줌 미팅 / 강사 / 온라인 / ${names}`, 2026, types, roster).rows[0];
  assert.ok(parse("이지선, 없는사용자").issues.participants); assert.deepEqual(parse("이지선").draft.participantIds, []);
  assert.equal(parse("전원").draft.participantIds.length, 5);
  assert.deepEqual(parse("윤지혜, 윤지혜").draft.participantIds, [people[1].id]);
  assert.deepEqual(parse("없음").draft.participantIds, []); assert.equal(parse("없음").issues.participants, undefined);
});

test("연도·날짜·요일·행 형식과 한 번에 100개 입력 제한을 확인한다", () => {
  const row = "10월 12일(월) / 11시 / 줌 미팅 / 강사 / 온라인 / 전원";
  assert.ok(parseCalendarBulk(row, 2027, types, people).rows[0].issues.date);
  assert.equal(parseCalendarBulk("2026년 " + row, 2027, types, people).rows[0].draft.eventDate, "2026-10-12");
  assert.ok(parseCalendarBulk(row.replace("10월 12일(월)", "2월 30일"), 2026, types, people).rows[0].issues.date);
  for (const text of ["항목/너무/적음", "", "a".repeat(30001), Array(101).fill(row).join("\n")]) assert.ok(parseCalendarBulk(text, 2026, types, people).errors.length);
  assert.ok(parseCalendarBulk(row, 1999, types, people).errors.length);
});

test("일괄 저장 요청은 제목/장소/참여자 및 기존/신규 종류의 배타적 선택을 검증한다", () => {
  const row = parseCalendarBulk("10월 12일(월) / 11시 / 줌 미팅 / 강사 / 온라인 / 전원", 2026, types, people).rows[0];
  const payload = { requestId: id(99), events: [bulkRowPayload(row)], createMissingTypes: false };
  assert.ok(bulkImportSchema.safeParse(payload).success);
  for (const patch of [{ meetingTypeId: null, newMeetingTypeName: null }, { newMeetingTypeName: "중복 종류" }, { locationKind: "custom", locationText: "" }, { participantIds: ["bad"] }, { title: "" }]) assert.equal(bulkImportSchema.safeParse({ ...payload, events: [{ ...payload.events[0], ...patch }] }).success, false);
  assert.equal(bulkImportSchema.safeParse({ ...payload, requestId: "bad" }).success, false);
  assert.equal(bulkImportSchema.safeParse({ ...payload, events: [] }).success, false);
});
