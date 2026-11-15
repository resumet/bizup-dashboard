export const applicantColumns = [
  ["title", "강의명"], ["username", "이름"], ["email", "이메일"], ["phone", "전화번호"],
  ["appliedAt", "신청일시(KST)"], ["inflowPath", "유입경로"], ["mediaChannel", "매체/채널"],
  ["isNewUser", "신규회원"], ["createdAt", "가입일시(KST)"], ["firstInflowFreeCourseTitle", "최초 유입 무료강의"],
] as const;
export type Applicant = Record<(typeof applicantColumns)[number][0], string | boolean | null>;
export type FreeStudentsSnapshot = { rows: Applicant[]; source_url: string; updated_at: string };

export function applicantValue(key: string, value: Applicant[keyof Applicant]): string {
  if (value === null || value === "") return "—";
  if (typeof value === "boolean") return value ? "예" : "아니오";
  if ((key === "appliedAt" || key === "createdAt") && !Number.isNaN(Date.parse(value))) {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).format(new Date(value));
  }
  return value;
}

export function filterApplicants(rows: Applicant[], query: string) {
  const q = query.trim().toLocaleLowerCase("ko-KR");
  const phoneQuery = /^[\d\s+-]+$/.test(q) ? q.replace(/\D/g, "") : "";
  return rows.filter(row => applicantColumns.some(([key]) => applicantValue(key, row[key]).toLocaleLowerCase("ko-KR").includes(q)) ||
    (phoneQuery && String(row.phone ?? "").replace(/\D/g, "").includes(phoneQuery)));
}

// The source CSV prop contains these ten business fields. Never persist user-profile tokens.
export function parseApplicants(text: string): Applicant[] {
  const match = /"data"\s*:\s*\[/.exec(text);
  if (!match) throw new Error("신청자 데이터를 찾지 못했습니다. 원본 페이지를 확인해 주세요.");
  const start = match.index + match[0].length - 1;
  let depth = 0, quoted = false, escaped = false;
  for (let end = start; end < text.length; end++) {
    const char = text[end];
    if (quoted) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') quoted = true;
    else if (char === "[") depth++;
    else if (char === "]" && --depth === 0) {
      let rows: unknown;
      try { rows = JSON.parse(text.slice(start, end + 1)); }
      catch { throw new Error("신청자 응답을 읽지 못했습니다. 다시 시도해 주세요."); }
      if (!Array.isArray(rows)) break;
      return rows.map(value => {
        if (!value || typeof value !== "object" || !("appliedAt" in value) || !("username" in value)) throw new Error("신청자 데이터 형식이 변경되었습니다.");
        return Object.fromEntries(applicantColumns.map(([key]) => {
          const item: unknown = (value as Record<string, unknown>)[key];
          if (item !== undefined && item !== null && typeof item !== "string" && typeof item !== "boolean") throw new Error("신청자 필드 형식을 확인해 주세요.");
          return [key, typeof item === "string" && item.startsWith("$D") ? item.slice(2) : item ?? null];
        })) as Applicant;
      });
    }
  }
  throw new Error("신청자 응답이 완전하지 않습니다. 다시 시도해 주세요.");
}
