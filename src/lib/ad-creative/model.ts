export type CreativePlatform = "google" | "meta";
export type CreativeRow = {
  platform: CreativePlatform;
  date: string;
  instructor: string;
  campaign: string;
  group: string;
  ad: string;
  status: string;
  adType: string;
  cost: number | null;
  impressions: number | null;
  clicks: number | null;
  conversions: number | null;
  webinar: string;
};
export type CreativeCourse = { name: string; instructor_name: string };
export type CreativeData = { url: string; updatedAt: string; rows: CreativeRow[]; error?: string };

export function creativeStatusTone(status: string) {
  const value = status.trim().toLowerCase().replace(/[\s-]+/gu, "_");
  if (["사용중", "사용_중", "게재중", "게재_중", "활성", "active", "enabled", "delivering", "eligible"].includes(value)) return "green";
  if (["일시중지", "일시_중지", "paused", "campaign_paused", "adset_paused"].includes(value)) return "amber";
  if (["not_delivering", "disapproved", "rejected", "비승인", "게재불가", "게재_불가", "with_issues"].includes(value)) return "red";
  if (["pending_review", "in_review", "검토중", "검토_중", "심사중", "심사_중", "pending"].includes(value)) return "blue";
  return "gray";
}

export function summarizeCreativeRows(rows: readonly CreativeRow[]) {
  const totals: Pick<CreativeRow, "cost" | "impressions" | "clicks" | "conversions"> = {
    cost: null, impressions: null, clicks: null, conversions: null,
  };
  for (const row of rows) {
    for (const key of ["cost", "impressions", "clicks", "conversions"] as const) {
      if (row[key] !== null) totals[key] = (totals[key] ?? 0) + row[key];
    }
  }
  return totals;
}

const normalize = (value: string) => value.normalize("NFKC").replace(/[\s_-]/gu, "").toLowerCase();
const aliases = {
  date: ["날짜", "일", "date", "day", "segments.date", "dateStart", "date_start"],
  instructor: ["강사", "강사명", "instructor", "instructorName", "teacherName"],
  campaign: ["캠페인", "캠페인명", "캠페인 이름", "campaign", "campaignName", "campaign.name"],
  group: ["광고그룹", "광고그룹명", "광고그룹 이름", "광고세트", "adGroup", "adGroupName", "ad_group.name", "adSetName"],
  ad: ["광고이름", "광고명", "광고 이름", "adName", "ad", "ad_group_ad.ad.name"],
  status: ["광고상태", "광고 상태", "status", "adStatus", "ad_group_ad.status"],
  adType: ["광고유형", "광고 유형", "adType", "type", "ad_group_ad.ad.type"],
  cost: ["비용", "cost", "adCost"],
  impressions: ["노출수", "impressions", "impression", "metrics.impressions"],
  clicks: ["클릭수", "clicks", "linkClick", "metrics.clicks"],
  conversions: ["전환", "전환수", "conversions", "leads", "metrics.conversions"],
  webinar: ["웨비나네임", "웨비나명", "webinarName", "강의명"],
} satisfies Record<keyof Omit<CreativeRow, "platform">, string[]>;

function cellText(value: unknown): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? "").trim();
}
function parseDate(value: string): string | null {
  const match = /^(\d{4})[.\-/년]\s*(\d{1,2})[.\-/월]\s*(\d{1,2})(?:일|\.)?(?:$|[ T])/u.exec(value);
  if (!match) return null;
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date ? null : date;
}
function numberValue(value: string): number | null {
  if (!value || /^[-—–]+$/u.test(value)) return null;
  const clean = value.replace(/[,₩￦$\s]/gu, "").replace(/원$/u, "");
  if (!/^-?\d+(?:\.\d+)?$/u.test(clean)) throw new Error(`숫자 형식을 확인해 주세요: ${value}`);
  const result = Number(clean);
  if (!Number.isFinite(result)) throw new Error("숫자 범위를 초과했습니다.");
  return result;
}

export function parseCreativeRows(platform: CreativePlatform, raw: readonly (readonly unknown[])[]): CreativeRow[] {
  const rows = raw.map(row => row.map(cellText));
  const headerIndex = rows.findIndex(row => row.some(cell => aliases.date.some(alias => normalize(alias) === normalize(cell))));
  if (headerIndex < 0) throw new Error(`${platform}_raw: 날짜 헤더를 찾을 수 없습니다.`);
  const header = rows[headerIndex].map(normalize);
  const columns = Object.fromEntries(Object.entries(aliases).map(([key, values]) => [key, header.findIndex(cell => values.some(alias => normalize(alias) === cell))])) as Record<keyof typeof aliases, number>;
  const required = Object.keys(aliases).filter(key => key !== "instructor" && (platform === "google" || key !== "adType")) as (keyof typeof aliases)[];
  const missing = required.filter(key => columns[key] < 0);
  if (missing.length) throw new Error(`${platform}_raw: 필수 열이 없습니다 (${missing.map(key => aliases[key][0]).join(", ")}).`);
  const result: CreativeRow[] = [];
  for (let index = headerIndex + 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.every(value => !value)) continue;
    const get = (key: keyof typeof aliases) => row[columns[key]] ?? "";
    const date = parseDate(get("date"));
    if (!date) throw new Error(`${platform}_raw ${index + 1}행: 날짜를 YYYY-MM-DD 형식으로 입력해 주세요.`);
    try {
      result.push({ platform, date, instructor: get("instructor"), campaign: get("campaign") || "캠페인 미입력",
        group: get("group") || "그룹 미입력", ad: get("ad") || "광고명 미입력", status: get("status"), adType: get("adType"),
        cost: numberValue(get("cost")), impressions: numberValue(get("impressions")), clicks: numberValue(get("clicks")),
        conversions: numberValue(get("conversions")), webinar: get("webinar") });
    } catch (error) { throw new Error(`${platform}_raw ${index + 1}행: ${error instanceof Error ? error.message : "값을 확인해 주세요."}`); }
  }
  return result;
}

export function assignCreativeInstructors(rows: CreativeRow[], courses: CreativeCourse[]): CreativeRow[] {
  const byName = new Map<string, Set<string>>();
  for (const course of courses) {
    if (!course.instructor_name.trim()) continue;
    const key = normalize(course.name);
    const names = byName.get(key) ?? new Set<string>();
    names.add(course.instructor_name.trim());
    byName.set(key, names);
  }
  return rows.map(row => {
    if (row.instructor.trim()) return row;
    const names = byName.get(normalize(row.webinar));
    const webinarInstructor = /^(.*?)\s*웨비나$/u.exec(row.webinar.trim())?.[1]?.trim();
    return { ...row, instructor: names?.size === 1 ? [...names][0] : webinarInstructor || "강사 미분류" };
  });
}

export function groupCreativeRows(rows: CreativeRow[], key: "instructor" | "platform" | "date" | "campaign" | "group" | "ad") {
  const groups = new Map<string, CreativeRow[]>();
  for (const row of rows) { const values = groups.get(row[key]) ?? []; values.push(row); groups.set(row[key], values); }
  return [...groups].sort(([a], [b]) => key === "date" ? b.localeCompare(a) : a.localeCompare(b, "ko"));
}
