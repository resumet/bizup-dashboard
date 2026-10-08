import { z } from "zod";
import type { CalendarDraft } from "./types";

export const START_TIMES = Array.from({ length: 27 }, (_, index) => 480 + index * 30);
export const DURATIONS = Array.from({ length: 48 }, (_, index) => (index + 1) * 30);

export function isDateKey(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && value >= "2000-01-01" && value <= "2100-12-31";
}

export const eventSchema = z.object({
  title: z.string().trim().min(1, "일정 제목을 입력해 주세요.").max(120, "제목은 120자까지 입력할 수 있습니다."),
  eventDate: z.string().refine(isDateKey, "올바른 날짜를 선택해 주세요. (2000~2100년)"),
  startMinutes: z.number().int().min(480).max(1260).multipleOf(30, "시작시간은 08:00~21:00의 30분 단위로 선택해 주세요."),
  durationMinutes: z.number().int().min(30).max(1440).multipleOf(30, "소요시간은 30분 단위로 선택해 주세요."),
  meetingTypeId: z.uuid("회의 종류를 선택해 주세요."),
  courseId: z.uuid("연결할 강의를 선택해 주세요.").nullable(),
  notes: z.string().trim().max(2000, "메모는 2,000자까지 입력할 수 있습니다."),
  participantIds: z.array(z.uuid("참여자를 다시 선택해 주세요.")).max(500, "참여자는 최대 500명까지 선택할 수 있습니다.").refine((ids) => new Set(ids).size === ids.length, "참여자가 중복되었습니다.").default([]),
});

export const versionSchema = z.object({ version: z.number().int().positive() });
export const moveEventSchema = versionSchema.extend({ eventDate: eventSchema.shape.eventDate });
export const meetingTypeSchema = z.object({ name: z.string().trim().min(1, "회의 항목 이름을 입력해 주세요.").max(40, "회의 항목 이름은 40자까지 입력할 수 있습니다.") });
export const uuidSchema = z.uuid();

export function formatTime(minutes: number) {
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatDuration(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return [hours ? `${hours}시간` : "", rest ? `${rest}분` : ""].filter(Boolean).join(" ");
}

export function formatEventTime(start: number, duration: number) {
  const end = start + duration;
  return `${formatTime(start)}~${end >= 1440 ? "다음 날 " : ""}${formatTime(end)} (${formatDuration(duration)})`;
}

// Only exact half-hour times inside the allowed start window are inferred.
// Bare 1–7 o'clock means afternoon; explicit 오전/오후 always takes precedence.
export function titleStartMinutes(title: string): number | null {
  const match = /(?<!\d)(?:(오전|오후)\s*)?(\d{1,2})\s*(?:시(?:\s*(반|\d{1,2}\s*분))?|:(\d{2})(?!\d))/u.exec(title);
  if (!match) return null;
  let hour = Number(match[2]);
  const minute = match[3] === "반" ? 30 : Number(match[4] ?? match[3]?.replace(/\s*분/u, "") ?? 0);
  if (match[1]) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (match[1] === "오후" ? 12 : 0);
  } else if (!match[4] && hour >= 1 && hour <= 7) hour += 12;
  const minutes = hour * 60 + minute;
  return (minute === 0 || minute === 30) && START_TIMES.includes(minutes) ? minutes : null;
}

export function updateDraftTitle(draft: CalendarDraft, title: string): CalendarDraft {
  const inferred = titleStartMinutes(title);
  return { ...draft, title, ...(inferred !== null && inferred !== titleStartMinutes(draft.title) ? { startMinutes: inferred } : {}) };
}

export function calendarShareText(draft: CalendarDraft, details: { meetingType?: string; course?: string; participants: string[] }) {
  return [draft.title.trim(), `일시: ${draft.eventDate} ${formatEventTime(draft.startMinutes, draft.durationMinutes)} (한국시간)`,
    details.meetingType ? `종류: ${details.meetingType}` : "", details.course ? `강의: ${details.course}` : "",
    details.participants.length ? `참여자: ${details.participants.join(", ")}` : "",
    draft.notes.trim() ? `\n${draft.notes.trim()}` : ""].filter(Boolean).join("\n");
}

export function koreaToday(now = new Date()) {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function shiftMonth(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}

export function monthDays(month: string) {
  const first = new Date(`${month}-01T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(first);
    date.setUTCDate(first.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
}
