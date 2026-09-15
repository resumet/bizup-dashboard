import { loadEnvConfig } from "@next/env";
import { getWorkerConfig } from "../src/lib/tools/youtube-download-worker";

async function main() {
  loadEnvConfig(process.cwd());
  const config = getWorkerConfig();
  if (!config) throw new Error("YOUTUBE_DOWNLOAD_WORKER_URL과 YOUTUBE_DOWNLOAD_WORKER_TOKEN이 설정되지 않았습니다.");
  const health = await fetch(`${config.baseUrl}/health`, { signal: AbortSignal.timeout(15_000), redirect: "error" });
  const body = await health.json().catch(() => null);
  if (!health.ok || body?.ok !== true) throw new Error("워커 /health 확인 실패: 서버 주소와 실행 상태를 확인해 주세요.");
  const checkAuth = (token: string) => fetch(`${config.baseUrl}/v1/info`, {
    method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ url: "" }), signal: AbortSignal.timeout(15_000), redirect: "error",
  });
  // An invalid URL checks authentication without fetching or downloading a YouTube video.
  const denied = await checkAuth(crypto.randomUUID());
  if (denied.status !== 401) throw new Error("인증되지 않은 워커 요청이 차단되지 않았습니다.");
  const authorized = await checkAuth(config.token);
  if (authorized.status === 401 || authorized.status === 403) throw new Error("Vercel용 토큰과 워커의 WORKER_API_TOKEN이 다릅니다.");
  const validation = await authorized.json().catch(() => null);
  if (authorized.status !== 400 || typeof validation?.detail !== "string") throw new Error("워커 인증 후 URL 검증 응답을 확인하지 못했습니다.");
  console.log("PASS: 워커 상태·인증 연결 확인 완료. 실제 영상은 요청하지 않았습니다.");
}

main().catch(error => {
  console.error(error instanceof Error && !/fetch failed|redirect|timeout/iu.test(error.message) ? error.message : "워커 연결 실패: 네트워크·HTTPS 주소·서버 실행 상태를 확인해 주세요.");
  process.exitCode = 1;
});
