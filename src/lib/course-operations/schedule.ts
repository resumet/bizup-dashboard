export const WEBINAR_TIME_OPTIONS = [
  { value: "10:30", label: "오전 10시 30분" },
  { value: "19:30", label: "오후 7시 30분" },
  { value: "19:00", label: "오후 7시" },
  { value: "20:00", label: "오후 8시" },
] as const;

const WEBINAR_TIMES = new Set<string>(
  WEBINAR_TIME_OPTIONS.map((option) => option.value),
);

const KOREA_DATETIME_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function koreaParts(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Object.fromEntries(
    KOREA_DATETIME_FORMATTER.formatToParts(date).map((part) => [
      part.type,
      part.value,
    ]),
  );
}

export function toKoreaDate(value: string) {
  const parts = koreaParts(value);
  return parts ? `${parts.year}-${parts.month}-${parts.day}` : "";
}

export function toKoreaTime(value: string) {
  const parts = koreaParts(value);
  return parts ? `${parts.hour}:${parts.minute}` : "";
}

export function toWebinarTime(value: string) {
  const time = toKoreaTime(value);
  return WEBINAR_TIMES.has(time) ? time : "19:30";
}

export function isAllowedWebinarTime(value: string) {
  return WEBINAR_TIMES.has(toKoreaTime(value));
}

export function isKoreaDateOnly(value: string) {
  return toKoreaTime(value) === "00:00";
}

export function koreaDateTimeToIso(date: string, time: string) {
  if (!date || !WEBINAR_TIMES.has(time)) return "";
  const parsed = new Date(`${date}T${time}:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}

export function koreaDateToIso(date: string) {
  if (!date) return "";
  const parsed = new Date(`${date}T00:00:00+09:00`);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString();
}
