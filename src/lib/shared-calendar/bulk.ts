import { z } from "zod";
import { eventSchema, formatTime, isDateKey, START_TIMES } from "./calendar";
import type { CalendarDraft, CalendarPerson, MeetingType } from "./types";

export const MAX_BULK_EVENTS = 100;
export const bulkEventSchema = z.object({
  ...eventSchema.shape,
  meetingTypeId: z.uuid().nullable(),
  newMeetingTypeName: z.string().trim().min(1).max(40).nullable(),
}).refine((row) => Boolean(row.meetingTypeId) !== Boolean(row.newMeetingTypeName), "회의 종류를 선택하거나 새 구분 이름을 확인해 주세요.")
  .refine((row) => row.locationKind === "custom" ? row.locationText.length > 0 : row.locationText === "", "장소를 확인해 주세요.");
export const bulkImportSchema = z.object({
  requestId: z.uuid(), createMissingTypes: z.boolean().default(false),
  events: z.array(bulkEventSchema).min(1).max(MAX_BULK_EVENTS),
});

export type BulkRow = {
  line: number;
  source: string;
  draft: CalendarDraft;
  newMeetingTypeName: string | null;
  issues: { date?: string; time?: string; participants?: string };
  endOptions: { label: string; durationMinutes: number }[];
};

export function normalizedName(value: string) { return value.normalize("NFC").replace(/\s+/gu, "").toLocaleLowerCase("ko"); }

function parseDate(value: string, year: number) {
  const clean = value.trim();
  const match = /^(?:(\d{4})\s*년\s*)?(\d{1,2})\s*월\s*(\d{1,2})\s*일(?:\s*\(([일월화수목금토])(?:요일)?\))?$/u.exec(clean);
  const date = match ? `${match[1] ?? year}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}` : clean;
  if (!isDateKey(date)) return { date: "", issue: "올바른 날짜를 선택해 주세요." };
  if (match?.[4] && "일월화수목금토"[new Date(`${date}T00:00:00Z`).getUTCDay()] !== match[4]) return { date, issue: "입력한 요일이 선택한 연도의 날짜와 다릅니다. 날짜를 확인해 주세요." };
  return { date };
}

function clockMinutes(value: string, start?: number): number | null {
  const match = /^(?:(오전|오후)\s*)?(\d{1,2})\s*(?:시(?:\s*(반|\d{1,2}\s*분))?|:(\d{2}))?$/u.exec(value.trim());
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = match[3] === "반" ? 30 : Number(match[4] ?? match[3]?.replace(/\s*분/u, "") ?? 0);
  if (![0, 30].includes(minute) || hour > 24 || (hour === 24 && minute !== 0)) return null;
  if (match[1]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[1] === "오후" ? 12 : 0);
  } else if (!match[4] && hour >= 1 && hour <= 12) {
    if (start === undefined) { if (hour <= 7) hour += 12; }
    else {
      if (start >= 720 && hour < 12) hour += 12;
      if (hour * 60 + minute <= start) hour += 12;
    }
  }
  let result = hour * 60 + minute;
  if (start !== undefined && result <= start) result += 1440;
  return result;
}

export function parseBulkTime(value: string) {
  if (/^(?:시간\s*)?미정$/u.test(value.trim())) return { startMinutes: 540, durationMinutes: 60, timeTbd: true, endOptions: [] };
  const parts = value.split(/[~～〜]/u).map((part) => part.trim());
  const start = clockMinutes(parts[0]);
  if (start === null || !START_TIMES.includes(start)) return { startMinutes: 540, durationMinutes: 60, timeTbd: false, endOptions: [], issue: "시작시간은 08:00~21:00의 30분 단위로 확인해 주세요." };
  if (parts.length === 1) return { startMinutes: start, durationMinutes: 60, timeTbd: false, endOptions: [] };
  const options = parts.slice(1).map((part) => clockMinutes(part, start));
  if (options.some((end) => end === null || end - start < 30 || end - start > 1440)) return { startMinutes: start, durationMinutes: 60, timeTbd: false, endOptions: [], issue: "종료시간을 해석할 수 없습니다. 소요시간을 직접 선택해 주세요." };
  const ends = Array.from(new Set(options as number[]));
  const endOptions = ends.map((end) => ({ label: `${end >= 1440 ? "다음 날 " : ""}${formatTime(end)}`, durationMinutes: end - start }));
  return { startMinutes: start, durationMinutes: ends.length === 1 ? ends[0] - start : 60, timeTbd: false, endOptions: ends.length > 1 ? endOptions : [],
    ...(ends.length > 1 ? { issue: "종료시간이 여러 개입니다. 하나를 선택하거나 소요시간을 직접 지정해 주세요." } : {}) };
}

export function parseCalendarBulk(text: string, year: number, types: MeetingType[], people: CalendarPerson[]): { rows: BulkRow[]; errors: string[] } {
  const rows: BulkRow[] = []; const errors: string[] = [];
  if (text.length > 30000) return { rows, errors: ["일괄 입력은 30,000자까지 가능합니다."] };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return { rows, errors: ["연도는 2000~2100년 사이에서 선택해 주세요."] };
  const active = people.filter((person) => person.active);
  for (const [index, raw] of text.split(/\r?\n/u).entries()) {
    const source = raw.trim().replace(/^\d+[.)]\s*/u, "");
    if (!source || /^날짜\s*\/\s*시간\s*\//u.test(source)) continue;
    const fields = source.split("/").map((field) => field.trim());
    if (fields.length !== 6) { errors.push(`${index + 1}행: 날짜 / 시간 / 구분 / 대상자 / 장소 / 참여 인원 6개 항목이 필요합니다.`); continue; }
    const [dateRaw, timeRaw, typeName, target, locationRaw, participantRaw] = fields;
    if (!typeName || !target) { errors.push(`${index + 1}행: 구분과 대상자를 입력해 주세요.`); continue; }
    const date = parseDate(dateRaw, year); const time = parseBulkTime(timeRaw);
    const normalizedType = normalizedName(typeName);
    const zoomAlias = ["줌미팅", "줌회의", "강사줌미팅"].includes(normalizedType);
    const type = types.find((item) => zoomAlias ? item.code === "instructor_zoom" : normalizedName(item.name) === normalizedType);
    const location = normalizedName(locationRaw);
    const locationKind = ["온라인", "online"].includes(location) ? "online" : ["", "장소미정", "미정", "-"].includes(location) ? "tbd" : "custom";
    const participantIds: string[] = []; const unmatched: string[] = [];
    if (["전원", "전체", "전체선택"].includes(normalizedName(participantRaw))) participantIds.push(...active.map((person) => person.id));
    else if (!["", "없음", "참여자없음", "미정", "-"].includes(normalizedName(participantRaw))) {
      for (const name of participantRaw.split(/[,，、]/u).map((name) => name.trim()).filter(Boolean)) {
        const matches = active.filter((person) => normalizedName(person.name) === normalizedName(name));
        if (matches.length === 1) participantIds.push(matches[0].id);
        else unmatched.push(matches.length > 1 ? `${name} (동명이인)` : name);
      }
    }
    rows.push({ line: index + 1, source, newMeetingTypeName: type ? null : typeName,
      draft: { title: `${typeName} · ${target}`, eventDate: date.date, startMinutes: time.startMinutes, durationMinutes: time.durationMinutes, timeTbd: time.timeTbd,
        meetingTypeId: type?.id ?? "", courseId: null, notes: `대상자: ${target}${time.issue ? `\n원본 시간: ${timeRaw}` : ""}`,
        locationKind, locationText: locationKind === "custom" ? locationRaw : "", participantIds: Array.from(new Set(participantIds)) },
      issues: { date: date.issue, time: time.issue, participants: unmatched.length ? `매칭되지 않은 참여자: ${unmatched.join(", ")}. 아래에서 직접 선택하고 확정하거나 참여자 없음을 선택해 주세요.` : undefined }, endOptions: time.endOptions });
  }
  if (rows.length > MAX_BULK_EVENTS) errors.push(`한 번에 ${MAX_BULK_EVENTS}개까지 등록할 수 있습니다.`);
  if (!rows.length && !errors.length) errors.push("등록할 일정 내용을 입력해 주세요.");
  return { rows, errors };
}

export function bulkRowPayload(row: BulkRow) {
  return { ...row.draft, meetingTypeId: row.newMeetingTypeName ? null : row.draft.meetingTypeId, newMeetingTypeName: row.newMeetingTypeName };
}
