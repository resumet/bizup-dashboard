import "server-only";

import { getPhoneSendError } from "@/lib/messages/phone";

import type {
  MessageBatchDeliveryResult,
  MessageDeliveryResult,
  MessageRecipientDeliveryResult,
  MessageSendResult,
} from "./types";

export type DirectalkFallback = {
  enabled: boolean;
  channel?: "SMS" | "LMS";
  senderNumber?: string;
  title?: string;
  message?: string;
};

type DirectalkAlimtalkOptions = {
  templateCode: string;
  idempotencyKey: string;
  channelId?: string;
  rootVariables?: Record<string, string>;
  removeDuplicates?: boolean;
  scheduledAt?: string;
  tags?: string[];
  fallback?: DirectalkFallback;
};

export type DirectalkAlimtalkRecipient = {
  phone: string;
  variables: Record<string, string>;
};

export type SendDirectalkAlimtalkBatchInput = DirectalkAlimtalkOptions & {
  recipients: DirectalkAlimtalkRecipient[];
};

export type SendDirectalkAlimtalkInput = DirectalkAlimtalkOptions &
  DirectalkAlimtalkRecipient;

type DirectalkConfig = {
  apiKey: string;
  channelId: string;
  baseUrl: string;
};

type JsonRecord = Record<string, unknown>;

const RETRY_DELAYS_MS = [1_000, 3_000] as const;

function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null
    ? (value as JsonRecord)
    : {};
}

function textValue(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
    : undefined;
}

function directalkBaseUrl(baseUrl: string) {
  const base = baseUrl.replace(/\/+$/u, "");
  return base.endsWith("/public/v1") ? base : `${base}/public/v1`;
}

export function getDirectalkConfig(): DirectalkConfig {
  const apiKey = process.env.DIRECTALK_API_KEY?.trim();
  const channelId = process.env.DIRECTALK_CHANNEL_ID?.trim();
  const missing = [
    !apiKey && "DIRECTALK_API_KEY",
    !channelId && "DIRECTALK_CHANNEL_ID",
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(
      `DirecTalk 환경변수가 누락되었습니다: ${missing.join(", ")}`,
    );
  }

  return {
    apiKey: apiKey!,
    channelId: channelId!,
    baseUrl: directalkBaseUrl(
      process.env.DIRECTALK_API_BASE_URL?.trim() ||
        "https://api.directalk.io/public/v1",
    ),
  };
}

export function parseDirectalkSendResponse(
  httpStatus: number,
  bodyValue: unknown,
): MessageSendResult {
  const body = asRecord(bodyValue);
  const data = asRecord(body.data);
  const code = textValue(body.code ?? data.code);
  const correlationId = textValue(
    body.correlationId ?? body.correlation_id ?? data.correlationId,
  );
  const groupId = textValue(data.groupId ?? data.group_id);
  const messageId = textValue(data.messageId ?? data.message_id);
  const providerStatus = textValue(data.status);
  const message = textValue(body.message ?? data.message);

  if (code === "8627") {
    return {
      provider: "directalk",
      ok: true,
      status: httpStatus,
      code,
      groupId,
      messageId,
      correlationId,
      providerStatus,
      deliveryPending: true,
      reason: "동일한 발송 요청이 이미 접수되었습니다.",
    };
  }

  if (httpStatus === 202 && body.success !== false) {
    return {
      provider: "directalk",
      ok: true,
      status: httpStatus,
      code,
      groupId,
      messageId,
      correlationId,
      providerStatus,
      deliveryPending: true,
    };
  }

  const defaultReason =
    httpStatus >= 200 && httpStatus < 300
      ? `DirecTalk 응답 상태가 202가 아닙니다: HTTP ${httpStatus}`
      : `DirecTalk HTTP ${httpStatus}`;
  const reason = message ?? defaultReason;

  return {
    provider: "directalk",
    ok: false,
    status: httpStatus,
    code,
    groupId,
    messageId,
    correlationId,
    providerStatus,
    reason: correlationId
      ? `${reason} (correlationId: ${correlationId})`
      : reason,
  };
}

function shouldRetry(status: number) {
  return status === 429 || status >= 500;
}

function wait(delayMs: number) {
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

export async function sendDirectalkAlimtalk(
  input: SendDirectalkAlimtalkInput,
): Promise<MessageSendResult> {
  const phone = input.phone.replace(/\D/gu, "");
  const phoneError = getPhoneSendError(phone);
  if (phoneError) {
    return {
      provider: "directalk",
      ok: false,
      status: null,
      reason: phoneError,
    };
  }

  return sendDirectalkAlimtalkBatch({
    ...input,
    recipients: [{ phone, variables: input.variables }],
  });
}

export async function sendDirectalkAlimtalkBatch(
  input: SendDirectalkAlimtalkBatchInput,
): Promise<MessageSendResult> {
  if (input.recipients.length === 0) {
    throw new Error("DirecTalk 발송 대상이 없습니다.");
  }
  if (input.recipients.length > 1_000) {
    throw new Error("DirecTalk는 요청당 최대 1,000명까지 발송할 수 있습니다.");
  }
  if (!input.templateCode.trim()) {
    throw new Error("DirecTalk 템플릿 코드가 누락되었습니다.");
  }
  if (!input.idempotencyKey.trim()) {
    throw new Error("DirecTalk Idempotency-Key가 누락되었습니다.");
  }

  const recipients = input.recipients.map((recipient, index) => {
    const phone = recipient.phone.replace(/\D/gu, "");
    const phoneError = getPhoneSendError(phone);
    if (phoneError) {
      throw new Error(`${index + 1}번째 수신자: ${phoneError}`);
    }
    return { phone, variables: recipient.variables };
  });

  const config = getDirectalkConfig();
  const payload = {
    channelId: input.channelId?.trim() || config.channelId,
    templateCode: input.templateCode.trim(),
    recipients,
    ...(input.rootVariables ? { variables: input.rootVariables } : {}),
    removeDuplicates: input.removeDuplicates ?? true,
    ...(input.scheduledAt ? { scheduledAt: input.scheduledAt } : {}),
    ...(input.tags?.length ? { tags: input.tags } : {}),
    ...(input.fallback ? { fallback: input.fallback } : {}),
    idempotencyKey: input.idempotencyKey,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${config.baseUrl}/messages/alimtalk`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      const result = parseDirectalkSendResponse(response.status, body);
      if (result.ok || !shouldRetry(response.status) || attempt === 2) {
        return result;
      }
    } catch (error) {
      if (attempt === 2) {
        return {
          provider: "directalk",
          ok: false,
          status: null,
          unknown: true,
          reason: error instanceof Error ? error.name : "네트워크 오류",
        };
      }
    }

    await wait(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
  }

  return {
    provider: "directalk",
    ok: false,
    status: null,
    unknown: true,
    reason: "DirecTalk 발송 결과를 확인할 수 없습니다.",
  };
}

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function records(value: unknown) {
  if (Array.isArray(value)) return value.map(asRecord);
  const data = asRecord(value);
  const candidates = [
    data.items,
    data.details,
    data.recipients,
    data.results,
    data.rows,
    data.messages,
    data.content,
    data.list,
  ];
  const list = candidates.find(Array.isArray);
  return Array.isArray(list) ? list.map(asRecord) : [];
}

function normalizedStatus(value: unknown) {
  return textValue(value)?.trim().toUpperCase();
}

function deliveryCorrelationId(body: JsonRecord, data: JsonRecord) {
  return textValue(
    body.correlationId ?? body.correlation_id ?? data.correlationId,
  );
}

function groupDeliveryResult(groupBodyValue: unknown): MessageDeliveryResult {
  const groupBody = asRecord(groupBodyValue);
  const groupData = asRecord(groupBody.data);
  const groupStatus = normalizedStatus(groupData.status) ?? "UNKNOWN";
  const groupCorrelationId = deliveryCorrelationId(groupBody, groupData);
  const groupMessage = textValue(
    groupData.failedReason ??
      groupData.failed_reason ??
      groupData.message ??
      groupBody.message,
  );

  if (["FAILED", "CANCELED"].includes(groupStatus)) {
    return {
      provider: "directalk",
      state: "failed",
      terminal: true,
      providerStatus: groupStatus,
      code: textValue(groupBody.code ?? groupData.code),
      reason: groupMessage ?? `DirecTalk 그룹 상태: ${groupStatus}`,
      correlationId: groupCorrelationId,
    };
  }
  if (groupStatus !== "COMPLETED") {
    return {
      provider: "directalk",
      state: "processing",
      terminal: false,
      providerStatus: groupStatus,
      correlationId: groupCorrelationId,
    };
  }

  return {
    provider: "directalk",
    state: "unknown",
    terminal: false,
    providerStatus: groupStatus,
    reason: "DirecTalk 개별 발송 결과가 아직 준비되지 않았습니다.",
    correlationId: groupCorrelationId,
  };
}

function parseDirectalkRecipientResult(
  detail: JsonRecord,
  correlationId?: string,
): MessageRecipientDeliveryResult | null {
  const seq = numericValue(detail.seq ?? detail.index);
  if (seq === undefined || !Number.isInteger(seq) || seq < 0) return null;
  const detailStatus = normalizedStatus(
    detail.status ??
      detail.deliveryStatus ??
      detail.delivery_status ??
      detail.resultStatus ??
      detail.result_status,
  );
  const code = textValue(
    detail.statusCode ??
      detail.status_code ??
      detail.resultCode ??
      detail.result_code ??
      detail.code,
  );
  const reason = textValue(
    detail.resultMessage ??
      detail.result_message ??
      detail.failureReason ??
      detail.failure_reason ??
      detail.message,
  );
  const finalMessageType = textValue(
    detail.finalMessageType ?? detail.final_message_type,
  );
  const explicitSuccess =
    detail.success === true ||
    detail.succeeded === true ||
    detail.isSuccess === true;
  const explicitFailure =
    detail.success === false ||
    detail.succeeded === false ||
    detail.isSuccess === false;
  const successStatus =
    detailStatus !== undefined &&
    ["SUCCESS", "SUCCEEDED", "DELIVERED", "COMPLETED", "SENT"].includes(
      detailStatus,
    );
  const failedStatus =
    detailStatus !== undefined &&
    ["FAILED", "FAIL", "CANCELED", "REJECTED", "UNDELIVERED"].includes(
      detailStatus,
    );
  const successCode =
    code === "0" || code === "0000" || code === "API_200";

  if (
    explicitFailure ||
    failedStatus ||
    (code &&
      !detailStatus &&
      !successCode &&
      !explicitSuccess &&
      !successStatus)
  ) {
    return {
      seq,
      provider: "directalk",
      state: "failed",
      terminal: true,
      providerStatus: detailStatus ?? "UNKNOWN",
      code,
      reason:
        reason ??
        (code
          ? `DirecTalk 개별 발송 실패 (${code})`
          : "DirecTalk 개별 발송에 실패했습니다."),
      finalMessageType,
      correlationId,
    };
  }
  if (explicitSuccess || successStatus || successCode) {
    return {
      seq,
      provider: "directalk",
      state: "success",
      terminal: true,
      providerStatus: detailStatus ?? "UNKNOWN",
      code,
      reason,
      finalMessageType,
      correlationId,
    };
  }
  return {
    seq,
    provider: "directalk",
    state: "processing",
    terminal: false,
    providerStatus: detailStatus ?? "UNKNOWN",
    code,
    reason: "DirecTalk 개별 발송 결과가 아직 준비되지 않았습니다.",
    finalMessageType,
    correlationId,
  };
}

export function parseDirectalkBatchDeliveryResponse(
  groupBodyValue: unknown,
  detailBodyValues: unknown[] = [],
): MessageBatchDeliveryResult {
  const group = groupDeliveryResult(groupBodyValue);
  if (group.providerStatus !== "COMPLETED") {
    return { ...group, recipients: [] };
  }

  const recipients = detailBodyValues.flatMap((detailsBodyValue) => {
    const detailsBody = asRecord(detailsBodyValue);
    const detailsData = asRecord(detailsBody.data);
    const correlationId = deliveryCorrelationId(detailsBody, detailsData);
    return records(detailsBody.data)
      .map((detail) => parseDirectalkRecipientResult(detail, correlationId))
      .filter(
        (result): result is MessageRecipientDeliveryResult => result !== null,
      );
  });

  if (recipients.length === 0) {
    return { ...group, recipients };
  }

  const terminal = recipients.every((recipient) => recipient.terminal);
  const successCount = recipients.filter(
    (recipient) => recipient.state === "success",
  ).length;
  const failedCount = recipients.filter(
    (recipient) => recipient.state === "failed",
  ).length;
  const state = !terminal
    ? "processing"
    : failedCount === recipients.length
      ? "failed"
      : successCount === recipients.length
        ? "success"
        : "failed";

  return {
    ...group,
    state,
    terminal,
    reason:
      terminal && failedCount > 0
        ? `${failedCount}명의 DirecTalk 발송이 실패했습니다.`
        : undefined,
    recipients,
  };
}

export function parseDirectalkDeliveryResponse(
  groupBodyValue: unknown,
  detailsBodyValue?: unknown,
): MessageDeliveryResult {
  const batch = parseDirectalkBatchDeliveryResponse(
    groupBodyValue,
    detailsBodyValue === undefined ? [] : [detailsBodyValue],
  );
  return batch.recipients[0] ?? groupDeliveryResult(groupBodyValue);
}

type DirectalkGetResponse = {
  status: number | null;
  body: JsonRecord;
  networkError?: string;
};

async function getDirectalkJson(url: string, apiKey: string) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      const body = asRecord(await response.json().catch(() => ({})));
      if (!shouldRetry(response.status) || attempt === 2) {
        return { status: response.status, body } satisfies DirectalkGetResponse;
      }
    } catch (error) {
      if (attempt === 2) {
        return {
          status: null,
          body: {},
          networkError:
            error instanceof Error ? error.message : "네트워크 오류",
        } satisfies DirectalkGetResponse;
      }
    }
    await wait(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS.at(-1)!);
  }
  return { status: null, body: {} } satisfies DirectalkGetResponse;
}

function lookupError(result: DirectalkGetResponse): MessageDeliveryResult {
  const data = asRecord(result.body.data);
  const correlationId = deliveryCorrelationId(result.body, data);
  const reason =
    result.networkError ??
    textValue(result.body.message ?? data.message) ??
    `DirecTalk 조회 실패${result.status ? `: HTTP ${result.status}` : ""}`;
  return {
    provider: "directalk",
    state: "unknown",
    terminal: false,
    code: textValue(result.body.code ?? data.code),
    reason: correlationId
      ? `${reason} (correlationId: ${correlationId})`
      : reason,
    correlationId,
  };
}

function nextDetailsCursor(bodyValue: unknown) {
  const body = asRecord(bodyValue);
  const data = asRecord(body.data);
  return textValue(data.nextCursor ?? data.next_cursor)?.trim() || undefined;
}

export async function getDirectalkBatchDeliveryResult(
  groupId: string,
): Promise<MessageBatchDeliveryResult> {
  if (!groupId.trim()) throw new Error("DirecTalk groupId가 누락되었습니다.");
  const config = getDirectalkConfig();
  const encodedGroupId = encodeURIComponent(groupId.trim());
  const group = await getDirectalkJson(
    `${config.baseUrl}/messages/${encodedGroupId}`,
    config.apiKey,
  );
  if (
    group.status === null ||
    group.status < 200 ||
    group.status >= 300 ||
    group.body.success === false
  ) {
    return { ...lookupError(group), recipients: [] };
  }

  const groupResult = parseDirectalkBatchDeliveryResponse(group.body);
  if (groupResult.providerStatus !== "COMPLETED") return groupResult;

  const detailBodies: JsonRecord[] = [];
  const seenCursors = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 100; page += 1) {
    const search = new URLSearchParams({ filter: "ALL", limit: "1000" });
    if (cursor) search.set("cursor", cursor);
    const details = await getDirectalkJson(
      `${config.baseUrl}/messages/${encodedGroupId}/details?${search.toString()}`,
      config.apiKey,
    );
    if (
      details.status === null ||
      details.status < 200 ||
      details.status >= 300 ||
      details.body.success === false
    ) {
      return { ...lookupError(details), recipients: [] };
    }
    detailBodies.push(details.body);
    const nextCursor = nextDetailsCursor(details.body);
    if (!nextCursor) break;
    if (seenCursors.has(nextCursor)) {
      return {
        provider: "directalk",
        state: "unknown",
        terminal: false,
        providerStatus: "DETAIL_CURSOR_LOOP",
        reason: "DirecTalk 상세 결과의 페이지 커서가 반복되었습니다.",
        recipients: [],
      };
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  }
  return parseDirectalkBatchDeliveryResponse(group.body, detailBodies);
}

export async function getDirectalkDeliveryResult(
  groupId: string,
): Promise<MessageDeliveryResult> {
  const batch = await getDirectalkBatchDeliveryResult(groupId);
  if (batch.recipients[0]) return batch.recipients[0];
  const { recipients, ...group } = batch;
  void recipients;
  return group;
}
