export const webinarFields = [
  { key: "group_chat_count", label: "최종 단톡방 인원", unit: "명", max: 1_000_000_000 },
  { key: "communication_count", label: "소통방 인원", unit: "명", max: 1_000_000_000 },
  { key: "live_start_count", label: "유튜브 라이브 시작 인원", unit: "명", max: 1_000_000_000 },
  { key: "live_peak_count", label: "유튜브 라이브 최대 인원", unit: "명", max: 1_000_000_000 },
  { key: "hours_to_peak", label: "최대 인원 도달 시간", unit: "시간", max: 1_000 },
  { key: "live_end_count", label: "유튜브 라이브 종료 인원", unit: "명", max: 1_000_000_000 },
  { key: "ad_spend", label: "광고비", unit: "원", max: 1_000_000_000_000 },
  { key: "payment_count", label: "결제 건수", unit: "건", max: 1_000_000_000 },
  { key: "revenue", label: "총 매출", unit: "원", max: 1_000_000_000_000 },
] as const;
export type WebinarField = typeof webinarFields[number]["key"];
export type WebinarMetrics = Record<WebinarField, number | null>;
export type WebinarRecord = WebinarMetrics & { course_id: string; version: number; updated_at: string };
export type WebinarCourse = { id: string; name: string; instructor_name: string; free_webinar_at: string; metrics: WebinarRecord | null };
export const emptyWebinarMetrics = (): WebinarMetrics => Object.fromEntries(webinarFields.map(field => [field.key, null])) as WebinarMetrics;

export function parseWebinarMetrics(value: unknown): WebinarMetrics {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("웨비나 입력 형식이 올바르지 않습니다.");
  const input = value as Record<string, unknown>;
  if (Object.keys(input).some(key => !webinarFields.some(field => field.key === key))) throw new Error("알 수 없는 웨비나 항목이 있습니다.");
  const result = emptyWebinarMetrics();
  for (const field of webinarFields) {
    const raw = input[field.key];
    if (raw === null || raw === undefined || raw === "") continue;
    const hours = field.key === "hours_to_peak";
    if (typeof raw !== "number" && (typeof raw !== "string" || !(hours ? /^\d+(?:\.\d{1,2})?$/ : /^\d+$/).test(raw))) throw new Error(`${field.label}: ${hours ? "소수 둘째 자리까지의 시간" : "정수"}를 입력해 주세요.`);
    const number = Number(raw);
    if (!Number.isFinite(number) || number < 0 || number > field.max || (!hours && !Number.isInteger(number)) || (hours && Math.abs(number * 100 - Math.round(number * 100)) > 0.000001)) throw new Error(`${field.label}: 0~${field.max.toLocaleString("ko-KR")}${field.unit} 범위로 입력해 주세요.`);
    result[field.key] = number;
  }
  if (result.live_peak_count !== null && [result.live_start_count, result.live_end_count].some(count => count !== null && count > result.live_peak_count!)) throw new Error("라이브 최대 인원은 시작·종료 인원보다 작을 수 없습니다.");
  return result;
}

export const ratio = (numerator: number | null, denominator: number | null) => numerator === null || denominator === null || denominator <= 0 ? null : numerator / denominator * 100;
export const ratioDefinitions = [
  { key: "chatToLive", label: "단톡방 → 라이브 시작", numerator: "live_start_count", denominator: "group_chat_count", formula: "라이브 시작 인원 ÷ 최종 단톡방 인원 × 100" },
  { key: "liveToPayment", label: "라이브 시작 → 결제", numerator: "payment_count", denominator: "live_start_count", formula: "결제 건수 ÷ 라이브 시작 인원 × 100" },
  { key: "chatToPayment", label: "단톡방 → 결제", numerator: "payment_count", denominator: "group_chat_count", formula: "결제 건수 ÷ 최종 단톡방 인원 × 100" },
  { key: "roas", label: "광고비 대비 매출 (ROAS)", numerator: "revenue", denominator: "ad_spend", formula: "총 매출 ÷ 광고비 × 100" },
] as const;

export function summarizeWebinars(courses: WebinarCourse[]) {
  const totals = emptyWebinarMetrics();
  for (const { key } of webinarFields) {
    if (key === "hours_to_peak") continue;
    const values = courses.flatMap(course => course.metrics?.[key] == null ? [] : [course.metrics[key]!]);
    totals[key] = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
  }
  const ratios = ratioDefinitions.map(definition => {
    // Each ratio uses the same set of courses on both sides, avoiding bias from partially entered data.
    const comparable = courses.filter(course => course.metrics?.[definition.numerator] != null && course.metrics?.[definition.denominator] != null);
    const numerator = comparable.reduce((sum, course) => sum + course.metrics![definition.numerator]!, 0);
    const denominator = comparable.reduce((sum, course) => sum + course.metrics![definition.denominator]!, 0);
    return { ...definition, value: ratio(numerator, denominator), count: comparable.length };
  });
  return { totals, ratios, entered: courses.filter(course => course.metrics && webinarFields.some(({ key }) => course.metrics![key] !== null)).length };
}
export const formatMetric = (value: number | null | undefined, unit = "") => value == null ? "—" : `${value.toLocaleString("ko-KR", { maximumFractionDigits: 2 })}${unit}`;
