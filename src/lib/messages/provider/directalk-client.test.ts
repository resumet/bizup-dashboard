import assert from "node:assert/strict";
import test from "node:test";

import {
  getDirectalkBatchDeliveryResult,
  getDirectalkDeliveryResult,
  parseDirectalkDeliveryResponse,
  parseDirectalkSendResponse,
  sendDirectalkAlimtalk,
  sendDirectalkAlimtalkBatch,
} from "./directalk-client";

test("DirecTalk 202 envelope에서 접수 결과와 correlationId를 읽는다", () => {
  assert.deepEqual(
    parseDirectalkSendResponse(202, {
      success: true,
      data: {
        groupId: "grp_123",
        status: "QUEUED",
        sendCount: 1,
      },
      correlationId: "corr_123",
    }),
    {
      provider: "directalk",
      ok: true,
      status: 202,
      code: undefined,
      groupId: "grp_123",
      messageId: undefined,
      correlationId: "corr_123",
      providerStatus: "QUEUED",
      deliveryPending: true,
    },
  );
});

test("DirecTalk 그룹이 진행 중이면 실제 발송 결과를 확정하지 않는다", () => {
  assert.deepEqual(
    parseDirectalkDeliveryResponse({
      success: true,
      data: { status: "RUNNING" },
      correlationId: "corr_running",
    }),
    {
      provider: "directalk",
      state: "processing",
      terminal: false,
      providerStatus: "RUNNING",
      correlationId: "corr_running",
    },
  );
});

test("DirecTalk 완료 그룹의 개별 성공 결과를 실제 성공으로 판정한다", () => {
  const result = parseDirectalkDeliveryResponse(
    { success: true, data: { status: "COMPLETED" } },
    {
      success: true,
      data: {
        items: [
          {
            seq: 0,
            status: "SUCCESS",
            resultCode: "0000",
            resultMessage: "전달 성공",
            finalMessageType: "AT",
          },
        ],
      },
      correlationId: "corr_success",
    },
  );

  assert.equal(result.state, "success");
  assert.equal(result.terminal, true);
  assert.equal(result.code, "0000");
  assert.equal(result.finalMessageType, "AT");
  assert.equal(result.correlationId, "corr_success");
});

test("DirecTalk 완료 그룹의 개별 실패 결과와 사유를 기록한다", () => {
  const result = parseDirectalkDeliveryResponse(
    { success: true, data: { status: "COMPLETED" } },
    {
      success: true,
      data: {
        rows: [
          {
            seq: 0,
            status: "FAILED",
            resultCode: "K101",
            resultMessage: "수신 거부",
          },
        ],
      },
    },
  );

  assert.equal(result.state, "failed");
  assert.equal(result.terminal, true);
  assert.equal(result.code, "K101");
  assert.equal(result.reason, "수신 거부");
});

test("DirecTalk data.list의 statusCode를 실제 결과 코드로 기록한다", () => {
  const result = parseDirectalkDeliveryResponse(
    { success: true, data: { status: "COMPLETED" } },
    {
      success: true,
      data: {
        list: [
          {
            seq: 0,
            status: "FAILED",
            statusCode: "API_521",
            finalMessageType: "AT",
          },
        ],
      },
    },
  );

  assert.equal(result.state, "failed");
  assert.equal(result.code, "API_521");
  assert.equal(result.reason, "DirecTalk 개별 발송 실패 (API_521)");
});

test("DirecTalk 상세 결과가 대기 중이면 결과 코드가 있어도 실패로 확정하지 않는다", () => {
  const result = parseDirectalkDeliveryResponse(
    { success: true, data: { status: "COMPLETED" } },
    {
      success: true,
      data: {
        list: [
          {
            seq: 0,
            status: "PENDING",
            statusCode: "API_102",
          },
        ],
      },
    },
  );

  assert.equal(result.state, "processing");
  assert.equal(result.terminal, false);
  assert.equal(result.code, "API_102");
});

test("DirecTalk 8627은 실패가 아닌 기존 요청 접수 완료로 처리한다", () => {
  const result = parseDirectalkSendResponse(409, {
    success: false,
    code: 8627,
    message: "Idempotency conflict",
    correlationId: "corr_duplicate",
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, "8627");
  assert.equal(result.correlationId, "corr_duplicate");
});

test("DirecTalk 발송 시 인증·멱등성 헤더와 정규화한 수신자를 전송한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.DIRECTALK_API_KEY;
  const originalChannelId = process.env.DIRECTALK_CHANNEL_ID;
  const originalBaseUrl = process.env.DIRECTALK_API_BASE_URL;
  let requestedUrl = "";
  let requestedInit: RequestInit | undefined;

  process.env.DIRECTALK_API_KEY = "test-api-key";
  process.env.DIRECTALK_CHANNEL_ID = "@bizup";
  process.env.DIRECTALK_API_BASE_URL = "https://directalk.example.test";
  globalThis.fetch = async (input, init) => {
    requestedUrl = String(input);
    requestedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        data: { groupId: "grp_send" },
        correlationId: "corr_send",
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await sendDirectalkAlimtalk({
      phone: "010-1234-5678",
      templateCode: "PAY_COMPLETE",
      variables: { 고객명: "홍길동", 강좌명: "테스트 강의" },
      idempotencyKey: "payment:123:complete",
    });

    assert.equal(result.ok, true);
    assert.equal(result.groupId, "grp_send");
    assert.equal(
      requestedUrl,
      "https://directalk.example.test/public/v1/messages/alimtalk",
    );
    const headers = new Headers(requestedInit?.headers);
    assert.equal(headers.get("Authorization"), "Bearer test-api-key");
    assert.equal(headers.get("Idempotency-Key"), "payment:123:complete");
    assert.deepEqual(JSON.parse(String(requestedInit?.body)), {
      channelId: "@bizup",
      templateCode: "PAY_COMPLETE",
      recipients: [
        {
          phone: "01012345678",
          variables: { 고객명: "홍길동", 강좌명: "테스트 강의" },
        },
      ],
      removeDuplicates: true,
      idempotencyKey: "payment:123:complete",
    });
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.DIRECTALK_API_KEY;
    else process.env.DIRECTALK_API_KEY = originalApiKey;
    if (originalChannelId === undefined) delete process.env.DIRECTALK_CHANNEL_ID;
    else process.env.DIRECTALK_CHANNEL_ID = originalChannelId;
    if (originalBaseUrl === undefined)
      delete process.env.DIRECTALK_API_BASE_URL;
    else process.env.DIRECTALK_API_BASE_URL = originalBaseUrl;
  }
});

test("DirecTalk 배치 발송은 여러 수신자를 한 요청에 담는다", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.DIRECTALK_API_KEY;
  const originalChannelId = process.env.DIRECTALK_CHANNEL_ID;
  const originalBaseUrl = process.env.DIRECTALK_API_BASE_URL;
  let requestedInit: RequestInit | undefined;

  process.env.DIRECTALK_API_KEY = "test-api-key";
  process.env.DIRECTALK_CHANNEL_ID = "@bizup";
  process.env.DIRECTALK_API_BASE_URL = "https://directalk.example.test";
  globalThis.fetch = async (_, init) => {
    requestedInit = init;
    return new Response(
      JSON.stringify({
        success: true,
        data: { groupId: "grp_batch", status: "QUEUED" },
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await sendDirectalkAlimtalkBatch({
      recipients: [
        { phone: "010-1111-2222", variables: { 고객명: "김하나" } },
        { phone: "010-3333-4444", variables: { 고객명: "이두나" } },
      ],
      templateCode: "PAY_COMPLETE",
      idempotencyKey: "payment:batch:1",
    });

    assert.equal(result.groupId, "grp_batch");
    assert.deepEqual(JSON.parse(String(requestedInit?.body)).recipients, [
      { phone: "01011112222", variables: { 고객명: "김하나" } },
      { phone: "01033334444", variables: { 고객명: "이두나" } },
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.DIRECTALK_API_KEY;
    else process.env.DIRECTALK_API_KEY = originalApiKey;
    if (originalChannelId === undefined) delete process.env.DIRECTALK_CHANNEL_ID;
    else process.env.DIRECTALK_CHANNEL_ID = originalChannelId;
    if (originalBaseUrl === undefined)
      delete process.env.DIRECTALK_API_BASE_URL;
    else process.env.DIRECTALK_API_BASE_URL = originalBaseUrl;
  }
});

test("DirecTalk 배치 상세 결과의 모든 페이지와 seq를 읽는다", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.DIRECTALK_API_KEY;
  const originalChannelId = process.env.DIRECTALK_CHANNEL_ID;
  const originalBaseUrl = process.env.DIRECTALK_API_BASE_URL;
  const requestedUrls: string[] = [];

  process.env.DIRECTALK_API_KEY = "delivery-api-key";
  process.env.DIRECTALK_CHANNEL_ID = "@bizup";
  process.env.DIRECTALK_API_BASE_URL = "https://directalk.example.test";
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.endsWith("/messages/grp_paged")) {
      return Response.json({ success: true, data: { status: "COMPLETED" } });
    }
    if (!url.includes("cursor=next-page")) {
      return Response.json({
        success: true,
        data: {
          list: [{ seq: 0, status: "SUCCESS", statusCode: "API_200" }],
          nextCursor: "next-page",
        },
      });
    }
    return Response.json({
      success: true,
      data: {
        list: [{ seq: 1, status: "FAILED", statusCode: "API_521" }],
        nextCursor: null,
      },
    });
  };

  try {
    const result = await getDirectalkBatchDeliveryResult("grp_paged");
    assert.equal(result.terminal, true);
    assert.deepEqual(
      result.recipients.map(({ seq, state, code }) => ({ seq, state, code })),
      [
        { seq: 0, state: "success", code: "API_200" },
        { seq: 1, state: "failed", code: "API_521" },
      ],
    );
    assert.equal(requestedUrls.length, 3);
    assert.match(requestedUrls[2], /cursor=next-page/);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.DIRECTALK_API_KEY;
    else process.env.DIRECTALK_API_KEY = originalApiKey;
    if (originalChannelId === undefined) delete process.env.DIRECTALK_CHANNEL_ID;
    else process.env.DIRECTALK_CHANNEL_ID = originalChannelId;
    if (originalBaseUrl === undefined)
      delete process.env.DIRECTALK_API_BASE_URL;
    else process.env.DIRECTALK_API_BASE_URL = originalBaseUrl;
  }
});

test("DirecTalk 오류 결과에는 운영 추적용 correlationId가 포함된다", () => {
  const result = parseDirectalkSendResponse(401, {
    success: false,
    code: 8621,
    message: "유효하지 않은 API 키입니다.",
    correlationId: "corr_error",
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, "8621");
  assert.equal(result.correlationId, "corr_error");
  assert.match(result.reason ?? "", /correlationId: corr_error/);
});

test("DirecTalk 그룹 완료 후 개별 결과 API를 조회한다", async () => {
  const originalFetch = globalThis.fetch;
  const originalApiKey = process.env.DIRECTALK_API_KEY;
  const originalChannelId = process.env.DIRECTALK_CHANNEL_ID;
  const originalBaseUrl = process.env.DIRECTALK_API_BASE_URL;
  const requestedUrls: string[] = [];

  process.env.DIRECTALK_API_KEY = "delivery-api-key";
  process.env.DIRECTALK_CHANNEL_ID = "@bizup";
  process.env.DIRECTALK_API_BASE_URL = "https://directalk.example.test";
  globalThis.fetch = async (input) => {
    const url = String(input);
    requestedUrls.push(url);
    if (url.endsWith("/messages/grp_delivery")) {
      return new Response(
        JSON.stringify({ success: true, data: { status: "COMPLETED" } }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          items: [
            {
              seq: 0,
              status: "DELIVERED",
              resultCode: "K000",
              finalMessageType: "AT",
            },
          ],
        },
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };

  try {
    const result = await getDirectalkDeliveryResult("grp_delivery");
    assert.equal(result.state, "success");
    assert.deepEqual(requestedUrls, [
      "https://directalk.example.test/public/v1/messages/grp_delivery",
      "https://directalk.example.test/public/v1/messages/grp_delivery/details?filter=ALL&limit=1000",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.DIRECTALK_API_KEY;
    else process.env.DIRECTALK_API_KEY = originalApiKey;
    if (originalChannelId === undefined) delete process.env.DIRECTALK_CHANNEL_ID;
    else process.env.DIRECTALK_CHANNEL_ID = originalChannelId;
    if (originalBaseUrl === undefined)
      delete process.env.DIRECTALK_API_BASE_URL;
    else process.env.DIRECTALK_API_BASE_URL = originalBaseUrl;
  }
});
