import "server-only";
import { type Channel, type Video, parseSource } from "./model";

type Item = { id: string; snippet?: { title: string; channelId: string; publishedAt: string; customUrl?: string; thumbnails?: { default?: { url: string } } }; statistics?: { viewCount?: string; likeCount?: string; commentCount?: string; videoCount?: string; subscriberCount?: string; hiddenSubscriberCount?: boolean }; contentDetails?: { relatedPlaylists?: { uploads: string }; videoId?: string }; status?: { privacyStatus: string } };
type ApiResult = { items?: Item[]; nextPageToken?: string; error?: { errors?: { reason: string }[] } };
export function setting(name: string, fallback: number, max: number) {
  const n = Number(process.env[name]);
  return Number.isInteger(n) && n > 0 ? Math.min(n, max) : fallback;
}
export async function youtube(resource: "channels" | "videos" | "playlistItems", params: Record<string,string>, fetcher: typeof fetch = fetch): Promise<ApiResult> {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) throw new Error("API_ERROR");
  const url = new URL(`https://www.googleapis.com/youtube/v3/${resource}`);
  url.search = new URLSearchParams({ ...params, key }).toString();
  const retries = setting("MAX_YOUTUBE_RETRIES",3,5);
  for (let attempt=0; attempt<=retries; attempt++) {
    let transient = false;
    try {
      const response = await fetcher(url, { cache: "no-store", signal: AbortSignal.timeout(20_000) });
      const data = await response.json() as ApiResult;
      if (response.ok) return data;
      const reasons = data.error?.errors?.map(e => e.reason) ?? [];
      if (reasons.some(r => ["quotaExceeded","dailyLimitExceeded"].includes(r))) throw new Error("YOUTUBE_QUOTA_EXCEEDED");
      transient = response.status >= 500 || response.status === 429 || reasons.includes("rateLimitExceeded");
      if (!transient) throw new Error(response.status === 404 ? "NOT_FOUND" : "API_ERROR");
    } catch (error) {
      if (error instanceof Error && ["YOUTUBE_QUOTA_EXCEEDED","NOT_FOUND","API_ERROR"].includes(error.message)) throw error;
      transient = true;
    }
    if (!transient || attempt === retries) throw new Error("API_ERROR");
    console.info("[youtube-analysis] retry", { resource, attempt: attempt+1 });
    await new Promise(resolve => setTimeout(resolve, 1000 * 2 ** attempt));
  }
  throw new Error("API_ERROR");
}
export async function resolveChannel(input: string): Promise<Channel> {
  const source = parseSource(input);
  let filter: Record<string,string>;
  if (source.kind === "video") {
    const video = (await youtube("videos", { part: "snippet,status", id: source.value })).items?.[0];
    if (!video?.snippet || video.status?.privacyStatus !== "public") throw new Error("NOT_FOUND");
    filter = { id: video.snippet.channelId };
  } else filter = { [source.kind === "handle" ? "forHandle" : source.kind === "user" ? "forUsername" : "id"]: source.value };
  const row = (await youtube("channels", { part: "snippet,statistics,contentDetails", ...filter })).items?.[0];
  if (!row?.snippet || !row.contentDetails?.relatedPlaylists?.uploads) throw new Error("NOT_FOUND");
  return { id: row.id, name: row.snippet.title, url: `https://www.youtube.com/${row.snippet.customUrl?.startsWith("@") ? encodeURI(row.snippet.customUrl) : `channel/${row.id}`}`, thumbnail: row.snippet.thumbnails?.default?.url ?? null, reported: Number(row.statistics?.videoCount ?? 0), subscribers: row.statistics?.hiddenSubscriberCount || row.statistics?.subscriberCount === undefined ? null : Number(row.statistics.subscriberCount), playlist: row.contentDetails.relatedPlaylists.uploads };
}
export async function videoPage(channel: Channel, token?: string) {
  const page = await youtube("playlistItems", { part: "contentDetails", playlistId: channel.playlist, maxResults: "50", ...(token ? { pageToken: token } : {}) });
  const ids = [...new Set((page.items ?? []).map(v => v.contentDetails?.videoId).filter((v): v is string => !!v))];
  const rows = ids.length ? (await youtube("videos", { part: "snippet,statistics,status", id: ids.join(",") })).items ?? [] : [];
  const videos: Video[] = rows.filter(v => v.status?.privacyStatus === "public" && v.snippet?.channelId === channel.id).map(v => ({ id: v.id, title: v.snippet!.title, publishedAt: v.snippet!.publishedAt, views: Number(v.statistics?.viewCount ?? 0), likes: v.statistics?.likeCount === undefined ? null : Number(v.statistics.likeCount), comments: v.statistics?.commentCount === undefined ? null : Number(v.statistics.commentCount) }));
  return { videos, next: page.nextPageToken };
}
