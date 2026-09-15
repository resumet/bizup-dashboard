import assert from "node:assert/strict";
import test from "node:test";
import { Sandbox } from "@vercel/sandbox";
import { getSandboxVideoInfo, prepareSandboxDownload } from "./youtube-download-sandbox";

test("Sandbox 인증, URL 검증, 종료와 다운로드 인계", async (context) => {
  let deleted = 0;
  let created = 0;
  let failedInstall = false;
  let workerToken = "";
  const fake = {
    domain: () => "https://sandbox.example",
    writeFiles: async () => {},
    runCommand: async (command: { args: string[]; env?: Record<string, string> }) => {
      if (command.env) {
        workerToken = command.env.WORKER_API_TOKEN;
        assert.match(workerToken, /^[a-f0-9]{64}$/);
        assert.notEqual(workerToken, command.env.DOWNLOAD_SIGNING_SECRET);
        assert.equal(command.env.SANDBOX_DOWNLOADS, "1");
      }
      return { exitCode: failedInstall && command.args.includes("pip") ? 1 : 0 };
    },
    delete: async () => { deleted++; },
  };
  context.mock.method(Sandbox, "create", async (options: { persistent: boolean; timeout: number }) => {
    created++;
    assert.equal(options.persistent, false);
    assert.ok(options.timeout <= 25 * 60_000);
    return fake;
  });
  context.mock.method(global, "fetch", async (_url: string, options: RequestInit) => {
    assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${workerToken}`);
    assert.equal(JSON.parse(options.body as string).url, "https://www.youtube.com/watch?v=jNQXAC9IVRw");
    return Response.json({ info: { id: "jNQXAC9IVRw", title: "test" } });
  });
  await assert.rejects(getSandboxVideoInfo("https://other.example/video"));
  assert.equal(created, 0);
  assert.equal((await getSandboxVideoInfo("https://youtu.be/jNQXAC9IVRw")).title, "test");
  assert.equal(deleted, 1);
  context.mock.method(global, "fetch", async () => Response.json({ detail: "공개 영상 정보를 확인하지 못했습니다." }, { status: 400 }));
  await assert.rejects(getSandboxVideoInfo("https://youtu.be/jNQXAC9IVRw"), /공개 영상/);
  assert.equal(deleted, 2);
  failedInstall = true;
  await assert.rejects(prepareSandboxDownload("https://youtu.be/jNQXAC9IVRw"), /설치하지 못했습니다/);
  assert.equal(deleted, 3);
  failedInstall = false;
  context.mock.method(global, "fetch", async () => Response.json({ downloadUrl: "https://other.example/file", statusUrl: "https://sandbox.example/status" }));
  await assert.rejects(prepareSandboxDownload("https://youtu.be/jNQXAC9IVRw"), /다운로드 주소/);
  assert.equal(deleted, 4);
  const prepared = { downloadUrl: "https://sandbox.example/download?token=test", statusUrl: "https://sandbox.example/status?token=test" };
  context.mock.method(global, "fetch", async () => Response.json(prepared));
  assert.deepEqual(await prepareSandboxDownload("https://youtu.be/jNQXAC9IVRw"), prepared);
  assert.equal(deleted, 4, "worker stays alive for direct browser download until bounded timeout");
});
