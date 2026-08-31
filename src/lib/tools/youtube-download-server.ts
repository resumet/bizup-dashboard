import "server-only";

import { execFile } from "node:child_process";
import { mkdtemp, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { promisify } from "node:util";

import { parseYoutubeUrl, sanitizeDownloadName, type YoutubeVideoInfo } from "./youtube-download";

const execFileAsync = promisify(execFile);
const YT_DLP_PATH = process.env.YT_DLP_PATH || "yt-dlp";

function friendlyDownloadError(error: unknown): never {
  const value = error as NodeJS.ErrnoException & { stderr?: string };
  const details = value.stderr || value.message || "";
  if (error instanceof Error && /500MB를 초과|다운로드 파일을 찾지|실시간 스트리밍/u.test(error.message)) throw error;
  if (value.code === "ENOENT") throw new Error("yt-dlp를 찾을 수 없습니다. YT_DLP_PATH 환경변수를 확인해 주세요.");
  if (/Private video|Sign in|members-only|age-restricted/iu.test(details)) throw new Error("비공개·멤버십·접근 제한 영상은 다운로드할 수 없습니다.");
  if (/larger than max-filesize|File is larger/iu.test(details)) throw new Error("500MB를 초과하는 영상은 다운로드할 수 없습니다.");
  throw new Error("영상을 처리하지 못했습니다. 공개 영상인지 확인해 주세요.");
}

export async function getYoutubeVideoInfo(value: string): Promise<YoutubeVideoInfo> {
  const target = parseYoutubeUrl(value);
  try {
    const { stdout } = await execFileAsync(YT_DLP_PATH, [
      "--dump-single-json",
      "--skip-download",
      "--no-playlist",
      "--no-warnings",
      target.url,
    ], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const info = JSON.parse(stdout) as Record<string, unknown>;
    if (info.is_live === true || info.live_status === "is_live") {
      throw new Error("실시간 스트리밍은 다운로드할 수 없습니다. 방송이 종료된 후 다시 시도해 주세요.");
    }
    return {
      id: typeof info.id === "string" ? info.id : target.videoId,
      title: typeof info.title === "string" ? info.title : "YouTube video",
      channel: typeof info.channel === "string" ? info.channel : typeof info.uploader === "string" ? info.uploader : "",
      duration: typeof info.duration === "number" ? info.duration : 0,
      thumbnail: typeof info.thumbnail === "string" && info.thumbnail.startsWith("https://") ? info.thumbnail : "",
    };
  } catch (error) {
    friendlyDownloadError(error);
  }
}

export async function downloadYoutubeVideo(value: string) {
  const target = parseYoutubeUrl(value);
  const info = await getYoutubeVideoInfo(target.url);
  const directory = await mkdtemp(join(tmpdir(), "bizup-youtube-"));
  const output = join(directory, `${sanitizeDownloadName(info.title)}.%(ext)s`);
  try {
    await execFileAsync(YT_DLP_PATH, [
      "--no-playlist",
      "--no-warnings",
      "--max-filesize", "500M",
      "--merge-output-format", "mp4",
      "--format", "bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/bv*+ba/b",
      "--output", output,
      target.url,
    ], { timeout: 15 * 60_000, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
    const files = (await readdir(directory)).filter((name) => !name.endsWith(".part") && !name.endsWith(".ytdl"));
    const filename = files[0];
    if (!filename) throw new Error("다운로드 파일을 찾지 못했습니다.");
    const filePath = join(directory, filename);
    const details = await stat(filePath);
    if (details.size > 500 * 1024 * 1024) throw new Error("500MB를 초과하는 영상은 다운로드할 수 없습니다.");
    const extension = extname(filename).toLowerCase();
    return {
      directory,
      filePath,
      filename: basename(filename),
      size: details.size,
      contentType: extension === ".webm" ? "video/webm" : "video/mp4",
    };
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    friendlyDownloadError(error);
  }
}
