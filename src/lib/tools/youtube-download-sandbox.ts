import "server-only";

import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "@vercel/sandbox";
import { parseYoutubeUrl, type YoutubeVideoInfo } from "./youtube-download";

const PORT = 8080;
const TIMEOUT = 25 * 60_000;
const DIRECTORY = "/tmp/bizup-worker";
const PYTHON = `${DIRECTORY}/venv/bin/python`;

async function stopSandbox(sandbox: Sandbox) {
  try { await sandbox.delete(); }
  catch { console.error("[youtube-sandbox] 정리에 실패했습니다. 최대 실행 시간 후 자동 종료됩니다."); }
}

async function startWorker(timeout = 5 * 60_000) {
  let sandbox: Sandbox;
  try {
    // Vercel supplies its project-scoped OIDC credentials automatically.
    sandbox = await Sandbox.create({
      image: "vercel/sandbox/universal",
      ports: [PORT],
      resources: { vcpus: 1 },
      timeout,
      persistent: false,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error("Vercel 다운로드 실행 환경을 시작하지 못했습니다. 프로젝트의 OIDC 설정과 Sandbox 사용 한도를 확인해 주세요.");
  }
  try {
    const token = randomBytes(32).toString("hex");
    const baseUrl = sandbox.domain(PORT);
    const [app, requirements] = await Promise.all([
      readFile(path.join(process.cwd(), "youtube-worker/app.py")),
      readFile(path.join(process.cwd(), "youtube-worker/requirements-sandbox.txt")),
    ]);
    await sandbox.writeFiles([
      { path: `${DIRECTORY}/app.py`, content: app },
      { path: `${DIRECTORY}/requirements.txt`, content: requirements },
    ]);
    const venv = await sandbox.runCommand({ cmd: "python3", args: ["-m", "venv", `${DIRECTORY}/venv`], timeoutMs: 20_000 });
    if (venv.exitCode !== 0) throw new Error("다운로드 실행 환경을 준비하지 못했습니다.");
    const install = await sandbox.runCommand({
      cmd: PYTHON,
      args: ["-m", "pip", "install", "--disable-pip-version-check", "--no-cache-dir", "-r", `${DIRECTORY}/requirements.txt`],
      timeoutMs: 120_000,
    });
    if (install.exitCode !== 0) throw new Error("영상 처리 도구를 설치하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    await sandbox.runCommand({
      cmd: PYTHON, args: ["-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", String(PORT), "--no-access-log"],
      cwd: DIRECTORY, detached: true,
      env: {
        WORKER_API_TOKEN: token,
        DOWNLOAD_SIGNING_SECRET: randomBytes(32).toString("hex"),
        PUBLIC_BASE_URL: baseUrl,
        SANDBOX_DOWNLOADS: "1",
      },
    });
    const ready = await sandbox.runCommand({
      cmd: PYTHON,
      args: ["-c", "import time, urllib.request\nfor attempt in range(40):\n try:\n  urllib.request.urlopen('http://127.0.0.1:8080/health', timeout=1); break\n except Exception:\n  time.sleep(.25)\nelse:\n raise RuntimeError('Worker did not start')"],
      timeoutMs: 15_000,
    });
    if (ready.exitCode !== 0) throw new Error("영상 처리 서버를 시작하지 못했습니다.");
    return { sandbox, token, baseUrl };
  } catch (error) {
    await stopSandbox(sandbox);
    throw error;
  }
}

async function requestWorker(worker: Awaited<ReturnType<typeof startWorker>>, endpoint: string, url: string) {
  const response = await fetch(`${worker.baseUrl}${endpoint}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${worker.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url }), cache: "no-store", signal: AbortSignal.timeout(60_000),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body || typeof body !== "object") {
    throw new Error(typeof body?.detail === "string" ? body.detail : "영상 처리 서버와 연결하지 못했습니다.");
  }
  return body;
}

export async function getSandboxVideoInfo(value: string): Promise<YoutubeVideoInfo> {
  const { url, videoId } = parseYoutubeUrl(value);
  const worker = await startWorker();
  try {
    const body = await requestWorker(worker, "/v1/info", url);
    if (body.info?.id !== videoId || typeof body.info?.title !== "string") throw new Error("영상 정보 응답이 올바르지 않습니다.");
    return body.info as YoutubeVideoInfo;
  } finally {
    await stopSandbox(worker.sandbox);
  }
}

export async function prepareSandboxDownload(value: string): Promise<{ downloadUrl: string; statusUrl: string }> {
  const { url } = parseYoutubeUrl(value);
  const worker = await startWorker(TIMEOUT);
  try {
    const body = await requestWorker(worker, "/v1/downloads", url);
    for (const key of ["downloadUrl", "statusUrl"]) {
      if (typeof body[key] !== "string" || new URL(body[key]).origin !== new URL(worker.baseUrl).origin) {
        throw new Error("다운로드 주소 응답이 올바르지 않습니다.");
      }
    }
    // The browser polls this worker directly; video bytes never pass through a Function.
    // No filesystem snapshot is retained; the sandbox terminates after TIMEOUT.
    return { downloadUrl: body.downloadUrl, statusUrl: body.statusUrl };
  } catch (error) {
    await stopSandbox(worker.sandbox);
    throw error;
  }
}
