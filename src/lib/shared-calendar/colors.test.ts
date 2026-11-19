import assert from "node:assert/strict";
import test from "node:test";
import { calendarChipStyle, defaultCalendarColors, meetingTypeColor, suggestedMeetingColor } from "./colors";

test("설정된 색상은 기본색보다 우선하며 이전 회의 항목에도 일정한 색상이 있다", () => {
  const type = { id: "1", name: "웨비나", code: "webinar" };
  assert.equal(meetingTypeColor(type), defaultCalendarColors.webinar);
  assert.equal(meetingTypeColor({ ...type, color: "#ABCDEF" }), "#abcdef");
  const custom = { ...type, code: null };
  assert.match(meetingTypeColor(custom), /^#[0-9a-f]{6}$/);
  assert.equal(meetingTypeColor(custom), meetingTypeColor({ ...custom, name: "다른 이름" }));
  assert.notEqual(suggestedMeetingColor([{ ...custom, color: suggestedMeetingColor([]) }]), suggestedMeetingColor([]));
});

test("중간 밝기와 채도가 높은 배경에서도 대비가 더 높은 글자색을 사용한다", () => {
  for (const bg of ["#ffffff", "#777777", "#00ff00", "#ffff00"]) {
    assert.deepEqual(calendarChipStyle(bg), { backgroundColor: bg, color: "#000000" });
  }
  for (const bg of ["#000000", "#666666", "#0000ff"]) {
    assert.deepEqual(calendarChipStyle(bg), { backgroundColor: bg, color: "#ffffff" });
  }
});
