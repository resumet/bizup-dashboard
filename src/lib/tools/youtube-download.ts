const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/u;
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
]);

export type YoutubeVideoInfo = {
  id: string;
  title: string;
  channel: string;
  duration: number;
  thumbnail: string;
};

export function parseYoutubeUrl(value: string) {
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error("올바른 유튜브 주소를 입력해 주세요.");
  }
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname) || url.username || url.password || url.port) {
    throw new Error("HTTPS 유튜브 주소만 사용할 수 있습니다.");
  }

  let videoId = "";
  if (url.hostname === "youtu.be") videoId = url.pathname.split("/").filter(Boolean)[0] || "";
  else if (url.pathname === "/watch") videoId = url.searchParams.get("v") || "";
  else {
    const match = url.pathname.match(/^\/(?:shorts|embed|live)\/([A-Za-z0-9_-]{11})(?:\/|$)/u);
    videoId = match?.[1] || "";
  }
  if (!VIDEO_ID_PATTERN.test(videoId)) {
    throw new Error("재생목록이 아닌 단일 영상 유튜브 주소를 입력해 주세요.");
  }
  return { url: `https://www.youtube.com/watch?v=${videoId}`, videoId };
}

export function sanitizeDownloadName(value: string) {
  const sanitized = value.replace(/[\\/:*?"<>|]/gu, "_").replace(/[\u0000-\u001f\u007f]/gu, "").trim();
  return (sanitized || "youtube-video").slice(0, 120);
}

export function formatDuration(seconds: number) {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remaining = safe % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remaining).padStart(2, "0")}`
    : `${minutes}:${String(remaining).padStart(2, "0")}`;
}
