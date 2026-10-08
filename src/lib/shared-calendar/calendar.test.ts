import assert from "node:assert/strict";
import test from "node:test";
import { DURATIONS, START_TIMES, calendarShareText, eventSchema, formatDuration, formatEventTime, isDateKey, koreaToday, meetingTypeSchema, monthDays, moveEventSchema, shiftMonth, titleStartMinutes, updateDraftTitle } from "./calendar";
import { validateRange, parseVersion, readCalendarBody } from "./server";

const valid = { title: "강사 미팅", eventDate: "2026-10-08", startMinutes: 480, durationMinutes: 30, meetingTypeId: "00000000-0000-4000-8000-000000000001", courseId: null, notes: "", locationKind: "tbd" as const, locationText: "", timeTbd: false };

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

test("제목의 한국어/24시간 표현과 오전·오후, 반 시간을 인식한다", () => {
  for (const [title, expected] of Object.entries({ "강사 11시 줌": 660, "오전 8시": 480, "오후 2시": 840, "오후2시 반 리허설": 870, "오후 12시 30분": 750, "11시30분": 690, "14:30 회의": 870, "08:00": 480, "21시": 1260, "1시 미팅": 780, "7시 반": 1170 })) assert.equal(titleStartMinutes(title), expected, title);
  for (const title of ["회의만", "오전 7시", "오전 12시", "22시", "21:30", "11시 15분", "14:45", "110시", "오후 13시", "25:00"]) assert.equal(titleStartMinutes(title), null, title);
});

test("제목 시간 변경만 자동 반영하고 사용자가 선택한 소요시간과 수동 시작시간은 보존한다", () => {
  const draft = { ...valid, startMinutes: 540, durationMinutes: 60, participantIds: [] };
  const inferred = updateDraftTitle(draft, "11시 미팅");
  assert.equal(inferred.startMinutes, 660); assert.equal(inferred.durationMinutes, 60);
  const manual = { ...inferred, startMinutes: 720, durationMinutes: 90 };
  assert.equal(updateDraftTitle(manual, "11시 미팅 자료 확인").startMinutes, 720);
  assert.equal(updateDraftTitle(manual, "오후 2시 미팅").startMinutes, 840);
  assert.equal(updateDraftTitle(manual, "오후 2시 미팅").durationMinutes, 90);
});

test("참여자는 생략/빈 선택이 가능하고 복수 UUID·중복·최대 인원을 검증한다", () => {
  const ids = [valid.meetingTypeId, "00000000-0000-4000-8000-000000000002"];
  assert.deepEqual(eventSchema.parse(valid).participantIds, []);
  assert.deepEqual(eventSchema.parse({ ...valid, participantIds: ids }).participantIds, ids);
  for (const participantIds of [null, "all", ["not-a-user"], [ids[0], ids[0]], Array(501).fill(ids[0])]) assert.equal(eventSchema.safeParse({ ...valid, participantIds }).success, false);
});

test("날짜 이동은 날짜/양의 버전만 필요하고 다른 필드를 변경하지 않는다", () => {
  assert.deepEqual(moveEventSchema.parse({ eventDate: "2026-11-01", version: 2, title: "변경 금지" }), { eventDate: "2026-11-01", version: 2 });
  for (const body of [{ eventDate: "2026-02-30", version: 1 }, { eventDate: valid.eventDate, version: 0 }, { eventDate: valid.eventDate }]) assert.equal(moveEventSchema.safeParse(body).success, false);
});

test("공유 텍스트는 제목·한국시간·종류·강의·복수 참여자·메모를 일반 텍스트로 구성한다", () => {
  const text = calendarShareText({ ...valid, title: "  11시 미팅  ", startMinutes: 660, durationMinutes: 60, notes: "자료 확인\n줌 접속", participantIds: [] }, { meetingType: "강사 줌미팅", course: "검증 강의 · 강사", participants: ["김강사", "이담당"] });
  assert.equal(text, "11시 미팅\n일시: 2026-10-08 11:00~12:00 (1시간) (한국시간)\n장소: 장소미정\n종류: 강사 줌미팅\n강의: 검증 강의 · 강사\n참여자: 김강사, 이담당\n\n자료 확인\n줌 접속");
  const empty = calendarShareText({ ...valid, participantIds: [] }, { participants: [] });
  assert.equal(empty.includes("참여자:"), false); assert.equal(empty.includes("강의:"), false);
});

test("장소 입력을 검증하고 공유문에 장소·시간 미정을 표시한다", () => {
  for (const locationKind of ["online", "tbd"]) assert.ok(eventSchema.safeParse({ ...valid, locationKind }).success);
  assert.ok(eventSchema.safeParse({ ...valid, locationKind: "custom", locationText: "오산 스튜디오", timeTbd: true }).success);
  for (const patch of [{ locationKind: "custom", locationText: " " }, { locationKind: "custom", locationText: "a".repeat(201) }, { locationKind: "office" }, { locationKind: "online", locationText: "오산" }, { timeTbd: "true" }]) assert.equal(eventSchema.safeParse({ ...valid, ...patch }).success, false);
  const text = calendarShareText({ ...valid, participantIds: [], locationKind: "custom", locationText: "오산", timeTbd: true }, { participants: [] });
  assert.ok(text.includes("시간 미정")); assert.ok(text.includes("장소: 오산")); assert.equal(text.includes("08:00"), false);
});
