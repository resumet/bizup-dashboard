import assert from "node:assert/strict";
import test from "node:test";
import { getWorkerConfig, getWorkerVideoInfo } from "./youtube-download-worker";

test("워커 설정 누락·인증·잘못된 응답을 구분한다", async (context) => {
  const keys = ["YOUTUBE_DOWNLOAD_WORKER_URL", "YOUTUBE_DOWNLOAD_WORKER_TOKEN"] as const;
  const original = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const originalFetch = global.fetch;
  context.after(() => {
    for (const key of keys) { if (original[key] === undefined) delete process.env[key]; else process.env[key] = original[key]; }
    global.fetch = originalFetch;
  });
  for (const key of keys) delete process.env[key];
  assert.equal(getWorkerConfig(), null);
  assert.equal(await getWorkerVideoInfo("https://youtu.be/jNQXAC9IVRw"), null);
  process.env.YOUTUBE_DOWNLOAD_WORKER_URL = "https://worker.example";
  assert.throws(() => getWorkerConfig(), /모두 설정/);
  process.env.YOUTUBE_DOWNLOAD_WORKER_TOKEN = "test-token";
  const videoUrl = "https://youtu.be/jNQXAC9IVRw";
  global.fetch = async () => new Response("<html>Not a worker</html>", { status: 200 });
  await assert.rejects(getWorkerVideoInfo(videoUrl), /서버 응답이 올바르지/);
  global.fetch = async () => Response.json({ detail: "Unauthorized" }, { status: 401 });
  await assert.rejects(getWorkerVideoInfo(videoUrl), /인증에 실패/);
  global.fetch = async () => Response.json({ detail: "공개 영상 정보를 확인하지 못했습니다." }, { status: 400 });
  await assert.rejects(getWorkerVideoInfo(videoUrl), /공개 영상 정보/);
  global.fetch = async (_, options) => {
    assert.equal((options?.headers as Record<string, string>).Authorization, "Bearer test-token");
    return Response.json({ info: { id: "jNQXAC9IVRw", title: "검증 영상" } });
  };
  assert.equal((await getWorkerVideoInfo(videoUrl))?.title, "검증 영상");
});
