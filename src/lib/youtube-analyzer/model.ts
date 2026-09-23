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
  return { count: videos.length, top: ranked[0] ?? null, exclude1: avg(ranked.slice(1)), exclude3: avg(ranked.slice(3)), recent5: avg(recent.slice(0,5)), recent10: avg(recent.slice(0,10)), recent20: avg(recent.slice(0,20)), samples: [5,10,20].map(n => Math.min(n,videos.length)) };
}
export type Metrics = ReturnType<typeof calculate>;
export type Analysis = { id: string; batch_id: string; channel_id: string; channel: Channel; metrics: Metrics; warnings: string[]; started_at: string; completed_at: string };
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
