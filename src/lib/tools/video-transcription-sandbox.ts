import "server-only";

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";

import { parseYoutubeUrl } from "./youtube-download";
import {
  type PreparedTranscription,
  type TranscriptionSource,
  sanitizeYoutubeCookies,
  validateVideoUpload,
} from "./video-transcription";

const PORT = 8080;
const TIMEOUT = 25 * 60_000;
const DIRECTORY = "/tmp/bizup-worker";
const PYTHON = `${DIRECTORY}/venv/bin/python`;

async function removeSandbox(sandbox: Sandbox) {
  try {
    await sandbox.delete();
  } catch {
    console.error("[video-transcription] 격리 작업 환경을 정리하지 못했습니다.");
  }
}

function youtubeCookies(sourceCookies?: string) {
  const configured = process.env.YOUTUBE_COOKIES_BASE64?.trim();
  const raw = sourceCookies?.trim() || (configured ? Buffer.from(configured, "base64").toString("utf8") : "");
  return raw ? sanitizeYoutubeCookies(raw) : "";
}

function youtubeProxyUrl() {
  const value = process.env.YOUTUBE_TRANSCRIPTION_PROXY_URL?.trim();
  if (!value) return "";
  const url = new URL(value);
  if (!["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol)) {
    throw new Error("YouTube 전사용 프록시 주소 형식이 올바르지 않습니다.");
  }
  return value;
}

async function startTranscriptionWorker(cookies = "") {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("음성 전사 API 설정이 필요합니다. 관리자에게 문의해 주세요.");
  }

  let sandbox: Sandbox;
  try {
    sandbox = await Sandbox.create({
      image: "vercel/sandbox/universal",
      ports: [PORT],
      resources: { vcpus: 1 },
      timeout: TIMEOUT,
      persistent: false,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("영상 처리 환경을 시작하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }

  try {
    const token = randomBytes(32).toString("hex");
    const baseUrl = sandbox.domain(PORT);
    const [app, requirements] = await Promise.all([
      readFile(path.join(process.cwd(), "youtube-worker/app.py")),
      readFile(path.join(process.cwd(), "youtube-worker/requirements-sandbox.txt")),
    ]);
    const workerFiles = [
      { path: `${DIRECTORY}/app.py`, content: app },
      { path: `${DIRECTORY}/requirements.txt`, content: requirements },
    ];
    if (cookies) workerFiles.push({ path: `${DIRECTORY}/youtube-cookies.txt`, content: Buffer.from(cookies) });
    await sandbox.writeFiles(workerFiles);
    const venv = await sandbox.runCommand({
      cmd: "python3",
      args: ["-m", "venv", `${DIRECTORY}/venv`],
      timeoutMs: 20_000,
    });
    if (venv.exitCode !== 0) throw new Error("영상 처리 환경을 준비하지 못했습니다.");
    const install = await sandbox.runCommand({
      cmd: PYTHON,
      args: [
        "-m",
        "pip",
        "install",
        "--disable-pip-version-check",
        "--no-cache-dir",
        "-r",
        `${DIRECTORY}/requirements.txt`,
      ],
      timeoutMs: 120_000,
    });
    if (install.exitCode !== 0) throw new Error("영상 처리 도구를 설치하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    await sandbox.runCommand({
      cmd: PYTHON,
      args: ["-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", String(PORT), "--no-access-log"],
      cwd: DIRECTORY,
      detached: true,
      env: {
        WORKER_API_TOKEN: token,
        DOWNLOAD_SIGNING_SECRET: randomBytes(32).toString("hex"),
        PUBLIC_BASE_URL: baseUrl,
        SANDBOX_DOWNLOADS: "1",
        OPENAI_API_KEY: apiKey,
        OPENAI_TRANSCRIPTION_MODEL: process.env.OPENAI_TRANSCRIPTION_MODEL?.trim() || "gpt-transcribe",
        ...(cookies ? { YOUTUBE_COOKIES_PATH: `${DIRECTORY}/youtube-cookies.txt` } : {}),
        ...(youtubeProxyUrl() ? { YOUTUBE_TRANSCRIPTION_PROXY_URL: youtubeProxyUrl() } : {}),
      },
    });
    const ready = await sandbox.runCommand({
      cmd: PYTHON,
      args: [
        "-c",
        "import time, urllib.request\nfor attempt in range(40):\n try:\n  urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=1); break\n except Exception:\n  time.sleep(.25)\nelse:\n raise RuntimeError('Worker did not start')",
      ],
      timeoutMs: 15_000,
    });
    if (ready.exitCode !== 0) throw new Error("영상 처리 서버를 시작하지 못했습니다.");
    return { sandbox, token, baseUrl };
  } catch (error) {
    await removeSandbox(sandbox);
    throw error;
  }
}

function validatePreparedResponse(body: Record<string, unknown>, baseUrl: string, needsUpload: boolean) {
  const keys = needsUpload
    ? ["statusUrl", "audioUrl", "textUrl", "uploadUrl"]
    : ["statusUrl", "audioUrl", "textUrl"];
  const origin = new URL(baseUrl).origin;
  for (const key of keys) {
    if (typeof body[key] !== "string" || new URL(body[key] as string).origin !== origin) {
      throw new Error("영상 처리 주소 응답이 올바르지 않습니다.");
    }
  }
  return body as PreparedTranscription;
}

async function requestWorker(
  worker: Awaited<ReturnType<typeof startTranscriptionWorker>>,
  endpoint: string,
  payload: Record<string, unknown>,
  needsUpload: boolean,
) {
  const response = await fetch(`${worker.baseUrl}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${worker.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  if (!response.ok || !body) {
    throw new Error(
      typeof body?.detail === "string" ? body.detail : "영상 처리 서버와 연결하지 못했습니다.",
    );
  }
  return validatePreparedResponse(body, worker.baseUrl, needsUpload);
}

export async function prepareSandboxTranscription(source: TranscriptionSource) {
  const cookies = source.type === "youtube" ? youtubeCookies(source.youtubeCookies) : "";
  const worker = await startTranscriptionWorker(cookies);
  try {
    if (source.type === "youtube") {
      const { url } = parseYoutubeUrl(source.url);
      return await requestWorker(worker, "/v1/transcriptions/youtube", { url }, false);
    }
    const upload = validateVideoUpload(source);
    return await requestWorker(
      worker,
      "/v1/transcriptions/uploads",
      {
        filename: upload.filename,
        size: upload.size,
        content_type: upload.contentType,
      },
      true,
    );
  } catch (error) {
    await removeSandbox(worker.sandbox);
    throw error;
  }
}
