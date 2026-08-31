import "server-only";

import { parseYoutubeUrl, type YoutubeVideoInfo } from "./youtube-download";

type WorkerConfig = {
  baseUrl: string;
  token: string;
};

function getWorkerConfig(): WorkerConfig | null {
  const baseUrl = process.env.YOUTUBE_DOWNLOAD_WORKER_URL?.trim();
  const token = process.env.YOUTUBE_DOWNLOAD_WORKER_TOKEN?.trim();
  if (!baseUrl && !token) return null;
  if (!baseUrl || !token) {
    throw new Error("YOUTUBE_DOWNLOAD_WORKER_URL과 YOUTUBE_DOWNLOAD_WORKER_TOKEN을 모두 설정해 주세요.");
  }
  const parsed = new URL(baseUrl);
  if (!/^https?:$/.test(parsed.protocol)) {
    throw new Error("다운로드 워커 주소가 올바르지 않습니다.");
  }
  if (process.env.NODE_ENV === "production" && parsed.protocol !== "https:") {
    throw new Error("배포 환경의 다운로드 워커는 HTTPS 주소를 사용해야 합니다.");
  }
  return { baseUrl: parsed.toString().replace(/\/$/, ""), token };
}

async function callWorker(path: string, url: string) {
  const config = getWorkerConfig();
  if (!config) return null;
  const response = await fetch(`${config.baseUrl}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ url: parseYoutubeUrl(url).url }),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : `다운로드 워커 오류 (HTTP ${response.status})`);
  }
  return body;
}

export async function getWorkerVideoInfo(url: string): Promise<YoutubeVideoInfo | null> {
  const body = await callWorker("/v1/info", url);
  if (!body) return null;
  const info = body.info as Record<string, unknown> | undefined;
  if (!info || typeof info.id !== "string" || typeof info.title !== "string") {
    throw new Error("다운로드 워커의 영상 정보 응답이 올바르지 않습니다.");
  }
  return {
    id: info.id,
    title: info.title,
    channel: typeof info.channel === "string" ? info.channel : "",
    duration: typeof info.duration === "number" ? info.duration : 0,
    thumbnail: typeof info.thumbnail === "string" ? info.thumbnail : "",
  };
}

export async function prepareWorkerDownload(url: string): Promise<string | null> {
  const body = await callWorker("/v1/downloads", url);
  if (!body) return null;
  if (typeof body.downloadUrl !== "string") {
    throw new Error("다운로드 워커가 파일 주소를 반환하지 않았습니다.");
  }
  const downloadUrl = new URL(body.downloadUrl);
  if (process.env.NODE_ENV === "production" && downloadUrl.protocol !== "https:") {
    throw new Error("다운로드 주소는 HTTPS여야 합니다.");
  }
  return downloadUrl.toString();
}

export function requireWorkerOnVercel(): never {
  throw new Error("Vercel 배포에서는 외부 다운로드 워커 환경변수가 필요합니다.");
}
