import "server-only";

import { getPhoneSendError } from "./phone";
import {
  deterministicProviderBatchId,
  providerBatchIdempotencyKey,
  type MessageProviderBatchKind,
} from "./provider-batches";
import type { MessageSendResult } from "./provider";
import { createAdminClient } from "@/lib/supabase/admin";

type DirectalkDispatchRecipient<TVariables> = {
  id: string;
  phone: string;
  variables: TVariables;
};

type DirectalkBatchDispatchInput<TVariables> = {
  kind: MessageProviderBatchKind;
  messageJobId: string;
  chunkIndex: number;
  recipients: DirectalkDispatchRecipient<TVariables>[];
  send: (
    recipients: Array<{ phone: string; variables: TVariables }>,
    idempotencyKey: string,
  ) => Promise<MessageSendResult>;
};

const STORE_CONFIG = {
  roster: {
    recipients: "message_recipients",
  },
  "address-book": {
    recipients: "address_book_message_recipients",
  },
} as const;

export async function dispatchDirectalkMessageBatch<TVariables>(
  input: DirectalkBatchDispatchInput<TVariables>,
) {
  const admin = createAdminClient();
  const config = STORE_CONFIG[input.kind];
  const requestedAt = new Date().toISOString();
  const invalid = input.recipients
    .map((recipient) => ({
      recipient,
      reason: getPhoneSendError(recipient.phone),
    }))
    .filter(
      (item): item is { recipient: DirectalkDispatchRecipient<TVariables>; reason: string } =>
        Boolean(item.reason),
    );
  const invalidIds = new Set(invalid.map((item) => item.recipient.id));
  const valid = input.recipients.filter(
    (recipient) => !invalidIds.has(recipient.id),
  );

  const invalidUpdates = await Promise.all(
    invalid.map(({ recipient, reason }) =>
      admin
        .from(config.recipients)
        .update({
          status: "failed",
          provider: "directalk",
          provider_status: "VALIDATION_FAILED",
          failure_reason: reason,
          provider_result_message: reason,
          requested_at: requestedAt,
          delivery_checked_at: requestedAt,
          completed_at: requestedAt,
        })
        .eq("id", recipient.id),
    ),
  );
  const invalidUpdateError = invalidUpdates.find((result) => result.error)?.error;
  if (invalidUpdateError) {
    throw new Error(
      `DirecTalk 수신자 검증 결과 저장 실패: ${invalidUpdateError.code}`,
    );
  }

  if (valid.length === 0) {
    return { failedCount: invalid.length, authFailed: false };
  }

  const batchId = deterministicProviderBatchId(
    input.kind,
    input.messageJobId,
    input.chunkIndex,
  );
  const idempotencyKey = providerBatchIdempotencyKey(
    input.kind,
    input.messageJobId,
    input.chunkIndex,
  );
  const parent =
    input.kind === "roster"
      ? { message_job_id: input.messageJobId }
      : { address_book_message_job_id: input.messageJobId };
  const { error: batchInsertError } = await admin
    .from("message_provider_batches")
    .upsert(
      {
        id: batchId,
        job_kind: input.kind,
        ...parent,
        provider: "directalk",
        chunk_index: input.chunkIndex,
        idempotency_key: idempotencyKey,
        recipient_count: valid.length,
        status: "pending",
      },
      { onConflict: "id", ignoreDuplicates: true },
    );
  if (batchInsertError) {
    throw new Error(`DirecTalk 배치 저장 실패: ${batchInsertError.code}`);
  }

  const { data: existingBatch, error: batchLoadError } = await admin
    .from("message_provider_batches")
    .select("id,status,http_status,group_id")
    .eq("id", batchId)
    .single();
  if (batchLoadError || !existingBatch) {
    throw new Error(
      `DirecTalk 배치 조회 실패: ${batchLoadError?.code ?? "UNKNOWN"}`,
    );
  }

  const terminalStatuses = new Set(["completed", "partial_failed", "failed"]);
  if (existingBatch.group_id || terminalStatuses.has(existingBatch.status)) {
    return {
      failedCount:
        invalid.length +
        (existingBatch.status === "failed" ? valid.length : 0),
      authFailed:
        existingBatch.http_status === 401 || existingBatch.http_status === 403,
    };
  }

  const { data: assignedCount, error: assignError } = await admin.rpc(
    "assign_message_provider_batch_recipients",
    {
      p_batch_id: batchId,
      p_recipients: valid.map((recipient, seq) => ({ id: recipient.id, seq })),
      p_requested_at: requestedAt,
    },
  );
  if (assignError || assignedCount !== valid.length) {
    throw new Error(
      `DirecTalk 수신자 배치 연결 실패: ${assignError?.code ?? `${assignedCount}/${valid.length}`}`,
    );
  }

  let result: MessageSendResult;
  try {
    result = await input.send(
      valid.map((recipient) => ({
        phone: recipient.phone,
        variables: recipient.variables,
      })),
      idempotencyKey,
    );
  } catch (error) {
    result = {
      provider: "directalk",
      ok: false,
      status: null,
      unknown: true,
      reason: error instanceof Error ? error.message : "DirecTalk 발송 오류",
    };
  }

  const completedAt = new Date().toISOString();
  const accepted = result.ok && result.deliveryPending && result.groupId;
  const batchStatus = accepted
    ? "submitted"
    : result.unknown || result.ok
      ? "unknown"
      : "failed";
  const failureReason = accepted
    ? null
    : result.reason ??
      (result.ok
        ? "DirecTalk groupId가 없어 실제 발송 결과를 조회할 수 없습니다."
        : "DirecTalk 발송 요청에 실패했습니다.");

  const { error: batchUpdateError } = await admin
    .from("message_provider_batches")
    .update({
      status: batchStatus,
      http_status: result.status,
      group_id: result.groupId ?? null,
      provider_status: result.providerStatus ?? null,
      provider_correlation_id: result.correlationId ?? null,
      failure_reason: failureReason,
      submitted_at: accepted ? completedAt : null,
      delivery_checked_at: batchStatus === "failed" ? completedAt : null,
      completed_at: batchStatus === "failed" ? completedAt : null,
    })
    .eq("id", batchId);
  if (batchUpdateError) {
    throw new Error(`DirecTalk 배치 결과 저장 실패: ${batchUpdateError.code}`);
  }

  const { error: recipientUpdateError } = await admin
    .from(config.recipients)
    .update({
      status: accepted || batchStatus === "unknown" ? "unknown" : "failed",
      http_status: result.status,
      shoong_code: result.code ?? null,
      provider: "directalk",
      provider_correlation_id: result.correlationId ?? null,
      provider_status:
        result.providerStatus ??
        (accepted ? "QUEUED" : batchStatus === "failed" ? "REQUEST_FAILED" : "UNKNOWN"),
      group_id: result.groupId ?? null,
      message_id: result.messageId ?? null,
      failure_reason: failureReason,
      provider_result_message: failureReason,
      delivery_checked_at: batchStatus === "failed" ? completedAt : null,
      completed_at: batchStatus === "failed" ? completedAt : null,
    })
    .in(
      "id",
      valid.map((recipient) => recipient.id),
    );
  if (recipientUpdateError) {
    throw new Error(
      `DirecTalk 수신자 접수 결과 저장 실패: ${recipientUpdateError.code}`,
    );
  }

  return {
    failedCount:
      invalid.length + (batchStatus === "failed" ? valid.length : 0),
    authFailed: result.status === 401 || result.status === 403,
  };
}
