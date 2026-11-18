import "server-only";
import { fetchAdminCoursePage } from "../bizup-admin/course-page";
import { parseLandingUtms, UTM_HEADERS } from "./model";

const mediaLabels = new Map(Object.entries({
  youtube: "유튜브", instagram: "인스타그램", meta: "메타", google: "구글",
  naver_cafe: "네이버 카페", kakao_free_lecture: "무료강의 안내방", threads: "쓰레드",
  daungeun: "당근", LgT3ax: "강사인스타그램", tH68Mi: "문자메시지", "4GRWEC": "블로그",
  UwXIWr: "카카오모먼트", QxUfOJ: "페이드",
}));

function trackingPayload(text: string): string {
  // The admin serves Flight records either directly or in streamed HTML scripts.
  if (text.trimStart().startsWith("<")) {
    const chunks = text.matchAll(/self\.__next_f\.push\(\s*\[\s*1\s*,\s*("(?:[^"\\]|\\.)*")\s*\]\s*\)/g);
    return Array.from(chunks, chunk => JSON.parse(chunk[1]) as string).join("");
  }
  return text;
}

function trackingArray(text: string, name: "referralLinks" | "influencerUsers" | "paidPlatforms"): unknown[] {
  // Flight text records can share a line with the surrounding component record.
  // Parse just the array; quoted strings may contain brackets or escaped quotes.
  const field = new RegExp('"' + name + '"\\s*:\\s*(?=\\[)').exec(text);
  if (field) {
    const start = field.index + field[0].length;
    let depth = 0, quoted = false;
    for (let end = start; end < text.length; end++) {
      const char = text[end];
      if (quoted && char === "\\") { end++; continue; }
      if (char === '"') quoted = !quoted;
      if (quoted) continue;
      if (char === "[") depth++;
      if (char === "]" && --depth === 0) {
        try { return JSON.parse(text.slice(start, end + 1)) as unknown[]; }
        catch { break; }
      }
    }
  }
  throw new Error("비즈업 어드민에서 트래킹 링크 목록을 읽지 못했습니다. 다시 시도해 주세요.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function referralNames(payload: string, channel: "influencer" | "paid") {
  const names = new Map<string, string>();
  if (channel === "influencer") {
    for (const user of trackingArray(payload, "influencerUsers")) {
      if (!isRecord(user) || typeof user.username !== "string" || !Array.isArray(user.ErpUserReferralLink)) continue;
      for (const referral of user.ErpUserReferralLink) {
        if (isRecord(referral) && typeof referral.code === "string") names.set(referral.code, user.username);
      }
    }
  } else {
    for (const platform of trackingArray(payload, "paidPlatforms")) {
      if (isRecord(platform) && typeof platform.code === "string" && typeof platform.name === "string") {
        names.set(platform.code, platform.name);
      }
    }
  }
  return names;
}

export async function fetchTrackingUtms(landingPageLink: string, request: typeof fetch = fetch) {
  const { courseId, text } = await fetchAdminCoursePage(landingPageLink, "tracking", request);
  const payload = trackingPayload(text);
  const links = trackingArray(payload, "referralLinks");
  if (!links.length) return [];
  let influencers: Map<string, string> | undefined;
  let paidPlatforms: Map<string, string> | undefined;
  const rows = links.map(link => {
    if (!link || typeof link !== "object" || !("freeCourseId" in link)
      || typeof link.freeCourseId !== "string" || link.freeCourseId.toLowerCase() !== courseId.toLowerCase()) {
      throw new Error("트래킹 링크의 강의 ID가 현재 무료 랜딩페이지와 일치하지 않습니다.");
    }
    if (!("urlLink" in link) || typeof link.urlLink !== "string" || !URL.canParse(link.urlLink)
      || !("shortUrl" in link) || (link.shortUrl !== null && typeof link.shortUrl !== "string")) {
      throw new Error("비즈업 어드민의 트래킹 URL 또는 단축 링크 형식을 확인해 주세요.");
    }
    const params = new URL(link.urlLink).searchParams;
    const channel = params.get("channel"), medium = params.get("media");
    if (!channel || !medium) throw new Error("비즈업 트래킹 URL에 유입 채널 또는 진행 매체가 없습니다.");
    const channelLabel = channel === "influencer" ? "제휴" : channel === "organic" ? "오가닉" : "페이드";
    let referral = "비즈업클래스";
    if (channel === "influencer") {
      influencers ??= referralNames(payload, "influencer");
      const code = params.get("code") || channel;
      referral = influencers.get(code) || code;
    } else if (channel !== "organic") {
      paidPlatforms ??= referralNames(payload, "paid");
      referral = paidPlatforms.get(channel) || channel;
    }
    return [channelLabel, referral, mediaLabels.get(medium) ?? medium, link.urlLink, link.shortUrl];
  });
  return parseLandingUtms([[...UTM_HEADERS], ...rows]);
}
