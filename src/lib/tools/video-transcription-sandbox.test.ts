import assert from "node:assert/strict";
import test from "node:test";
import { Sandbox } from "@vercel/sandbox";

import { prepareSandboxTranscription } from "./video-transcription-sandbox";

test("격리 환경에서 유튜브 전사 작업을 준비하고 브라우저용 주소를 검증한다", async (context) => {
  const previousKey = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "test-openai-key";
  let deleted = 0;
  let workerToken = "";
  const fake = {
    domain: () => "https://sandbox.example",
    writeFiles: async () => {},
    runCommand: async (command: { args: string[]; env?: Record<string, string> }) => {
      if (command.env) {
        workerToken = command.env.WORKER_API_TOKEN;
        assert.equal(command.env.OPENAI_API_KEY, "test-openai-key");
        assert.equal(command.env.OPENAI_TRANSCRIPTION_MODEL, "gpt-transcribe");
      }
      return { exitCode: 0 };
    },
    delete: async () => { deleted++; },
  };
  context.after(() => {
    if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = previousKey;
  });
  context.mock.method(Sandbox, "create", async (options: { persistent: boolean; timeout: number }) => {
    assert.equal(options.persistent, false);
    assert.ok(options.timeout <= 25 * 60_000);
    return fake;
  });
  context.mock.method(global, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://sandbox.example/v1/transcriptions/youtube");
    assert.equal((options.headers as Record<string, string>).Authorization, `Bearer ${workerToken}`);
    assert.equal(
      JSON.parse(options.body as string).url,
      "https://www.youtube.com/watch?v=jNQXAC9IVRw",
    );
    return Response.json({
      statusUrl: "https://sandbox.example/status",
      audioUrl: "https://sandbox.example/audio",
      textUrl: "https://sandbox.example/text",
    });
  });

  const prepared = await prepareSandboxTranscription({
    type: "youtube",
    url: "https://youtu.be/jNQXAC9IVRw",
  });
  assert.equal(prepared.audioUrl, "https://sandbox.example/audio");
  assert.equal(deleted, 0, "결과 다운로드가 끝날 때까지 작업 환경을 유지한다");

  context.mock.method(global, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://sandbox.example/v1/transcriptions/uploads");
    assert.deepEqual(JSON.parse(options.body as string), {
      filename: "sample.mp4",
      size: 1024,
      content_type: "video/mp4",
    });
    return Response.json({
      statusUrl: "https://sandbox.example/status",
      audioUrl: "https://sandbox.example/audio",
      textUrl: "https://sandbox.example/text",
      uploadUrl: "https://sandbox.example/upload",
    });
  });
  const upload = await prepareSandboxTranscription({
    type: "upload",
    filename: "sample.mp4",
    size: 1024,
    contentType: "video/mp4",
  });
  assert.equal(upload.uploadUrl, "https://sandbox.example/upload");

  context.mock.method(global, "fetch", async () => Response.json({
    statusUrl: "https://sandbox.example/status",
    audioUrl: "https://other.example/audio",
    textUrl: "https://sandbox.example/text",
  }));
  await assert.rejects(
    prepareSandboxTranscription({ type: "youtube", url: "https://youtu.be/jNQXAC9IVRw" }),
    /주소 응답/u,
  );
  assert.equal(deleted, 1);
});

test("API 키가 없으면 격리 환경을 만들기 전에 중단한다", async (context) => {
  const previousKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  let created = 0;
  context.after(() => {
    if (previousKey !== undefined) process.env.OPENAI_API_KEY = previousKey;
  });
  context.mock.method(Sandbox, "create", async () => {
    created++;
    throw new Error("should not run");
  });
  await assert.rejects(
    prepareSandboxTranscription({ type: "youtube", url: "https://youtu.be/jNQXAC9IVRw" }),
    /API 설정/u,
  );
  assert.equal(created, 0);
});
