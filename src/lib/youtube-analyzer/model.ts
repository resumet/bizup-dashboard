export type Source = { kind: "channel" | "handle" | "user" | "video"; value: string; normalized: string };
export function parseSource(input: string): Source {
  const url = new URL(input.trim());
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port || !["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"].includes(url.hostname)) throw new Error("INVALID_URL");
  const parts = decodeURIComponent(url.pathname).split("/").filter(Boolean);
  let kind: Source["kind"], value: string;
  if (url.hostname === "youtu.be") { kind = "video"; value = parts[0]; }
  else if (parts[0]?.startsWith("@")) { kind = "handle"; value = parts[0]; }
  else if (parts[0] === "channel") { kind = "channel"; value = parts[1]; }
  else if (parts[0] === "user") { kind = "user"; value = parts[1]; }
  else if (parts[0] === "watch") { kind = "video"; value = url.searchParams.get("v") ?? ""; }
  else if (["shorts", "live"].includes(parts[0])) { kind = "video"; value = parts[1]; }
  else if (parts[0] === "c") throw new Error("CHANNEL_RESOLUTION_AMBIGUOUS");
  else throw new Error("INVALID_URL");
  if (!value || (kind === "video" && !/^[\w-]{11}$/.test(value)) || (kind === "channel" && !/^UC[\w-]{22}$/.test(value)) || ((kind === "handle" || kind === "user") && /[\s/?#\\]/.test(value)) || value === "@") throw new Error("INVALID_URL");
  return { kind, value, normalized: `https://www.youtube.com/${kind === "video" ? `watch?v=${value}` : kind === "handle" ? encodeURI(value) : `${kind}/${encodeURIComponent(value)}`}` };
}
export function inputs(text: string) {
  const seen = new Set<string>();
  return text.split(/\r?\n/).map(s => s.trim()).filter(Boolean).filter(s => {
    let key = s;
    try { key = parseSource(s).normalized; } catch { /* Invalid links remain individual failures. */ }
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export type Video = { id: string; title: string; publishedAt: string; views: number; likes: number | null; comments: number | null };
export type Channel = { id: string; name: string; url: string; thumbnail: string | null; reported: number; subscribers: number | null; playlist: string };
export function calculate(videos: Video[]) {
  const recent = [...videos].sort((a,b) => b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const ranked = [...videos].sort((a,b) => b.views-a.views || b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id));
  const avg = (rows: Video[]) => rows.length ? rows.reduce((sum,v) => sum+v.views, 0)/rows.length : null;
  const recent30 = recent.slice(0,30);
  const avgAvailable = (values: (number | null)[]) => {
    const available = values.filter((value): value is number => value !== null);
    return available.length ? available.reduce((sum,value) => sum+value,0)/available.length : null;
  };
  return { count: videos.length, top: ranked[0] ?? null, exclude1: avg(ranked.slice(1)), exclude3: avg(ranked.slice(3)), recent5: avg(recent.slice(0,5)), recent10: avg(recent.slice(0,10)), recent20: avg(recent.slice(0,20)), recent30Likes: avgAvailable(recent30.map(video => video.likes)), recent30Comments: avgAvailable(recent30.map(video => video.comments)), recent30Count: recent30.length, samples: [5,10,20].map(n => Math.min(n,videos.length)) };
}
export type Metrics = Omit<ReturnType<typeof calculate>, "top"> & { top: Video | null };
export const EMAIL_SIGNATURE_MODES = ["gmail_default", "custom"] as const;
export type EmailSignatureMode = (typeof EMAIL_SIGNATURE_MODES)[number];
export type YoutubeEmailSettings = {
  email_body: string | null;
  signature_mode: EmailSignatureMode;
  custom_signature: string | null;
};
export const DEFAULT_YOUTUBE_EMAIL_SETTINGS: YoutubeEmailSettings = {
  email_body: null,
  signature_mode: "gmail_default",
  custom_signature: null,
};
export const CHANNEL_CATEGORIES = [
  "타이탄 외부채널",
  "타이탄 내부채널",
  "N잡 연구소 내부채널",
  "N잡 연구소 협력채널",
  "휴먼스토리 산하채널",
  "레드락",
  "마브스쿨",
  "N잡연구소",
  "인베이더스쿨",
  "쇼츠아재",
  "하이퍼클래스",
  "서과장쪽",
  "하이클래스",
] as const;
export type ChannelCategory = (typeof CHANNEL_CATEGORIES)[number];
export type Analysis = { position: number; channel_id: string; channel: Channel; email: string | null; category: ChannelCategory | null; appearance_fee: number | null; rs_percent: number | null; memo: string | null; excluded_from_updates: boolean; metrics: Metrics; warnings: string[]; first_analyzed_at: string; last_analyzed_at: string };
export function normalizeChannelCategory(value: unknown): ChannelCategory | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !CHANNEL_CATEGORIES.includes(value as ChannelCategory)) throw new Error("INVALID_CATEGORY");
  return value as ChannelCategory;
}
export function normalizeAppearanceFee(value: unknown): number | null {
  if (value === null || value === "") return null;
  const normalized = typeof value === "string" ? value.replaceAll(",", "") : value;
  const amount = typeof normalized === "string" && /^\d+$/.test(normalized) ? Number(normalized) : normalized;
  if (typeof amount !== "number" || !Number.isSafeInteger(amount) || amount < 0) throw new Error("INVALID_APPEARANCE_FEE");
  return amount;
}
export function normalizeRsPercent(value: unknown): number | null {
  if (value === null || value === "") return null;
  if (typeof value !== "number" && (typeof value !== "string" || !/^\d+(?:\.\d+)?$/.test(value))) throw new Error("INVALID_RS_PERCENT");
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("INVALID_RS_PERCENT");
  return percent;
}
export function normalizeChannelEmail(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") throw new Error("INVALID_EMAIL");
  const email = value.trim();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/u.test(email)) {
    throw new Error("INVALID_EMAIL");
  }
  return email;
}
export function normalizeChannelMemo(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2000) throw new Error("INVALID_MEMO");
  return value.trim() ? value : null;
}
export function normalizeYoutubeEmailBody(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 5000) throw new Error("INVALID_EMAIL_BODY");
  return value.trim() ? value : null;
}
export function normalizeEmailSignatureMode(value: unknown): EmailSignatureMode {
  if (typeof value !== "string" || !EMAIL_SIGNATURE_MODES.includes(value as EmailSignatureMode)) {
    throw new Error("INVALID_EMAIL_SIGNATURE_MODE");
  }
  return value as EmailSignatureMode;
}
export function normalizeCustomEmailSignature(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || value.length > 2000) throw new Error("INVALID_EMAIL_SIGNATURE");
  return value.trim() ? value : null;
}
export function normalizeExcludedFromUpdates(value: unknown): boolean {
  if (typeof value !== "boolean") throw new Error("INVALID_EXCLUDED_FROM_UPDATES");
  return value;
}
export type AnalysisRequest = { id: string; input_url: string; status: string; error_code: string | null; resolved_channel_id: string | null };
export type Batch = { id: string; status: string; input_count: number; unique_channel_count: number; created_at: string; completed_at: string | null };
export const errorMessages: Record<string,string> = {
  INVALID_URL: "지원하는 YouTube 채널 또는 영상 URL을 입력해 주세요.",
  CHANNEL_RESOLUTION_AMBIGUOUS: "채널을 확정할 수 없습니다. @핸들 또는 영상 URL을 입력해 주세요.",
  NOT_FOUND: "공개 채널 또는 영상을 찾을 수 없습니다.",
  YOUTUBE_QUOTA_EXCEEDED: "YouTube API 할당량을 초과했습니다. 할당량 복구 후 다시 요청해 주세요.",
  API_ERROR: "YouTube 데이터 수집에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  SAVE_ERROR: "분석 저장에 실패했습니다. 다시 요청해 주세요.",
  START_ERROR: "백그라운드 분석을 시작하지 못했습니다. 다시 요청해 주세요.",
};
