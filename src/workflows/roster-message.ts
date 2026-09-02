import { createHash } from "node:crypto";

import {
  filterGroupChatNonParticipants,
  filterRosterRows,
} from "@/lib/jobs/filter";
import { loadJobRoster } from "@/lib/jobs/server";
import {
  EMPTY_ROSTER_FILTERS,
  type RosterFilters,
} from "@/lib/jobs/types";
import { dispatchDirectalkMessageBatch } from "@/lib/messages/directalk-batch-dispatch";
import {
  chunkMessageRecipients,
  dedupeMessageRecipientsByPhone,
  messageDispatchBatchSize,
  resolveMessageJobStatus,
} from "@/lib/messages/dispatch";
import { syncMessageDeliveryResults } from "@/lib/messages/delivery-sync";
import { getPhoneSendError } from "@/lib/messages/phone";
import {
  optionKey,
  optionLabel,
  validateInviteValues,
  type InviteValues,
} from "@/lib/messages/invite";
import {
  getMessageProvider,
  type FixedMessageTemplate,
  type MessageProviderName,
  type MessageSendResult,
} from "@/lib/messages/provider";
import { createAdminClient } from "@/lib/supabase/admin";
import { sleep } from "workflow";

const DELIVERY_POLL_DELAYS_MS = [
  5_000,
  10_000,
  15_000,
  30_000,
  30_000,
  30_000,
  30_000,
  30_000,
  30_000,
  30_000,
];

export type RosterMessageWorkflowInput = {
  messageJobId: string;
  jobId: string;
  provider: MessageProviderName;
  scope: "all" | "filtered" | "selected";
  template: FixedMessageTemplate;
  filters: Partial<RosterFilters>;
  selectedIds: string[];
  onlyGroupChatNonParticipants: boolean;
  courseName: string;
  optionInvites: Record<string, InviteValues>;
};

type PreparedRosterRecipient = {
  id: string;
  enrollmentId: string;
  phone: string;
  customerName: string;
  courseName: string;
  entryCode?: string;
  linkName?: string;
};

function deterministicRecipientId(messageJobId: string, enrollmentId: string) {
  const hex = createHash("sha256")
    .update(`${messageJobId}:${enrollmentId}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function prepareRosterRecipients(input: RosterMessageWorkflowInput) {
  "use step";
  console.info("[roster-message] preparing recipients", {
    messageJobId: input.messageJobId,
    scope: input.scope,
  });

  const admin = createAdminClient();
  const { job, rows } = await loadJobRoster(admin, input.jobId);
  const filters: RosterFilters = { ...EMPTY_ROSTER_FILTERS, ...input.filters };
  const selectedIds = new Set(input.selectedIds);
  const scopeTargets =
    input.scope === "all"
      ? rows
      : input.scope === "filtered"
        ? filterRosterRows(rows, filters)
        : rows.filter((row) => selectedIds.has(row.id));
  const targets = dedupeMessageRecipientsByPhone(
    filterGroupChatNonParticipants(
      scopeTargets,
      input.onlyGroupChatNonParticipants,
    ),
    (target) => target.normalizedPhone,
  );

  if (targets.length === 0) throw new Error("발송 대상이 없습니다.");
  if (targets.length > 1_000) {
    throw new Error("한 번에 최대 1,000명까지 발송할 수 있습니다.");
  }

  if (input.template === "paid_invite") {
    const targetOptionKeys = [
      ...new Set(targets.map((row) => optionKey(row.values.optionName))),
    ];
    const optionErrors = targetOptionKeys.flatMap((key) =>
      validateInviteValues(
        input.optionInvites[key] ?? { entryCode: "", linkName: "" },
      ).map((error) => `${optionLabel(key)}: ${error}`),
    );
    if (optionErrors.length > 0) throw new Error(optionErrors.join("\n"));
  }

  const recipients: PreparedRosterRecipient[] = targets.map((target) => {
    const courseName =
      input.courseName.trim() ||
      target.values.courseName ||
      job.default_course_name ||
      "";
    if (!target.normalizedPhone || !target.values.customerName || !courseName) {
      throw new Error("이름·전화번호·강좌명이 없는 발송 대상이 있습니다.");
    }
    const invite = input.optionInvites[optionKey(target.values.optionName)];
    return {
      id: deterministicRecipientId(input.messageJobId, target.id),
      enrollmentId: target.id,
      phone: target.normalizedPhone,
      customerName: target.values.customerName,
      courseName,
      entryCode: invite?.entryCode.trim(),
      linkName: invite?.linkName.trim(),
    };
  });

  for (let start = 0; start < recipients.length; start += 500) {
    const batch = recipients.slice(start, start + 500);
    const { error } = await admin.from("message_recipients").upsert(
      batch.map((recipient) => ({
        id: recipient.id,
        message_job_id: input.messageJobId,
        enrollment_id: recipient.enrollmentId,
        normalized_phone: recipient.phone,
        provider: input.provider,
      })),
      { onConflict: "id" },
    );
    if (error) throw new Error(`발송 대상 저장 실패: ${error.code}`);
  }

  const { error: updateError } = await admin
    .from("message_jobs")
    .update({ requested_count: recipients.length })
    .eq("id", input.messageJobId);
  if (updateError) throw new Error(`발송 작업 갱신 실패: ${updateError.code}`);
  return recipients;
}

async function dispatchRosterBatch(
  input: RosterMessageWorkflowInput,
  recipients: PreparedRosterRecipient[],
  chunkIndex: number,
  successBefore: number,
  failedBefore: number,
) {
  "use step";
  console.info("[roster-message] dispatching batch", {
    messageJobId: input.messageJobId,
    count: recipients.length,
  });

  const admin = createAdminClient();
  const provider = getMessageProvider(input.provider);
  if (provider.name === "directalk") {
    if (!provider.sendFixedMessages) {
      throw new Error("DirecTalk 배치 발송 기능이 설정되지 않았습니다.");
    }
    const batchResult = await dispatchDirectalkMessageBatch({
      kind: "roster",
      messageJobId: input.messageJobId,
      chunkIndex,
      recipients: recipients.map((recipient) => ({
        id: recipient.id,
        phone: recipient.phone,
        variables: {
          customerName: recipient.customerName,
          courseName: recipient.courseName,
          entryCode: recipient.entryCode,
          linkName: recipient.linkName,
        },
      })),
      send: (targets, idempotencyKey) =>
        provider.sendFixedMessages!({
          recipients: targets,
          template: input.template,
          idempotencyKey,
        }),
    });
    const failedCount = failedBefore + batchResult.failedCount;
    await admin
      .from("message_jobs")
      .update({ success_count: successBefore, failed_count: failedCount })
      .eq("id", input.messageJobId);
    return {
      successCount: successBefore,
      failedCount,
      authFailed: batchResult.authFailed,
    };
  }

  const { data: pending, error: pendingError } = await admin
    .from("message_recipients")
    .select("id")
    .in("id", recipients.map((recipient) => recipient.id))
    .eq("status", "pending");
  if (pendingError) throw new Error(`발송 대상 확인 실패: ${pendingError.code}`);
  const pendingIds = new Set((pending ?? []).map((recipient) => recipient.id));
  const targets = recipients.filter((recipient) => pendingIds.has(recipient.id));

  if (targets.length > 0) {
    const { error: lockError } = await admin
      .from("message_recipients")
      .update({ status: "unknown", requested_at: new Date().toISOString() })
      .in("id", targets.map((target) => target.id))
      .eq("status", "pending");
    if (lockError) throw new Error(`발송 대상 잠금 실패: ${lockError.code}`);
  }

  const results = await Promise.all(
    targets.map(async (recipient) => {
      let result: MessageSendResult;
      const phoneError = getPhoneSendError(recipient.phone);
      if (phoneError) {
        result = {
          provider: provider.name,
          ok: false,
          status: null,
          unknown: false,
          reason: phoneError,
        };
      } else {
        try {
          result = await provider.sendFixedMessage({
            phone: recipient.phone,
            template: input.template,
            variables: {
              customerName: recipient.customerName,
              courseName: recipient.courseName,
              entryCode: recipient.entryCode,
              linkName: recipient.linkName,
            },
            idempotencyKey: `roster:${input.messageJobId}:${recipient.id}`,
          });
        } catch (error) {
          result = {
            provider: provider.name,
            ok: false,
            status: null,
            reason: error instanceof Error ? error.message : "메시지 발송 오류",
          };
        }
      }

      const deliveryPending = result.ok && result.deliveryPending;
      const completedAt = new Date().toISOString();
      const { error: resultError } = await admin
        .from("message_recipients")
        .update({
          status:
            deliveryPending
              ? "unknown"
              : result.ok
                ? "success"
                : result.unknown
                  ? "unknown"
                  : "failed",
          http_status: result.status,
          shoong_code: result.code ?? null,
          provider: result.provider,
          provider_correlation_id: result.correlationId ?? null,
          provider_status: result.providerStatus ?? null,
          delivery_checked_at:
            result.provider === "directalk" && !deliveryPending
              ? completedAt
              : null,
          group_id: result.groupId ?? null,
          message_id: result.messageId ?? null,
          failure_reason:
            deliveryPending ? null : result.reason ?? null,
          completed_at: deliveryPending ? null : completedAt,
        })
        .eq("id", recipient.id);
      if (resultError) {
        console.error("[roster-message] recipient result update failed", {
          recipientId: recipient.id,
          code: resultError.code,
        });
      }
      return result;
    }),
  );

  const successCount =
    successBefore +
    results.filter((result) => result.ok && !result.deliveryPending).length;
  const failedCount = failedBefore + results.filter((result) => !result.ok).length;
  await admin
    .from("message_jobs")
    .update({ success_count: successCount, failed_count: failedCount })
    .eq("id", input.messageJobId);
  return {
    successCount,
    failedCount,
    authFailed: results.some((result) => result.status === 401 || result.status === 403),
  };
}
dispatchRosterBatch.maxRetries = 0;

async function syncRosterDeliveryResults(messageJobId: string) {
  "use step";
  return syncMessageDeliveryResults("roster", messageJobId);
}

async function failPendingRosterRecipients(messageJobId: string) {
  "use step";
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("message_recipients")
    .update({
      status: "failed",
      failure_reason: "메시지 공급자 인증 오류로 발송 작업이 중단되었습니다.",
      completed_at: new Date().toISOString(),
    })
    .eq("message_job_id", messageJobId)
    .eq("status", "pending")
    .select("id");
  if (error) throw new Error(`잔여 발송 대상 처리 실패: ${error.code}`);
  return data?.length ?? 0;
}

async function finishRosterJob(
  messageJobId: string,
  successCount: number,
  failedCount: number,
  pendingCount = 0,
) {
  "use step";
  const admin = createAdminClient();
  const { error } = await admin
    .from("message_jobs")
    .update({
      status:
        pendingCount > 0
          ? "processing"
          : resolveMessageJobStatus(successCount, failedCount),
      success_count: successCount,
      failed_count: failedCount,
      completed_at: pendingCount > 0 ? null : new Date().toISOString(),
    })
    .eq("id", messageJobId);
  if (error) throw new Error(`발송 작업 완료 저장 실패: ${error.code}`);
}

async function failRosterJob(messageJobId: string, reason: string) {
  "use step";
  console.error("[roster-message] workflow failed", { messageJobId, reason });
  const admin = createAdminClient();
  await admin
    .from("message_jobs")
    .update({ status: "failed", completed_at: new Date().toISOString() })
    .eq("id", messageJobId);
}

export async function sendRosterMessagesWorkflow(input: RosterMessageWorkflowInput) {
  "use workflow";
  console.info("[roster-message] workflow started", {
    messageJobId: input.messageJobId,
  });

  try {
    const recipients = await prepareRosterRecipients(input);
    let successCount = 0;
    let failedCount = 0;
    let pendingCount = 0;
    const batches = chunkMessageRecipients(
      recipients,
      messageDispatchBatchSize(input.provider),
    );
    for (const [chunkIndex, batch] of batches.entries()) {
      const progress = await dispatchRosterBatch(
        input,
        batch,
        chunkIndex,
        successCount,
        failedCount,
      );
      successCount = progress.successCount;
      failedCount = progress.failedCount;
      if (progress.authFailed) {
        failedCount += await failPendingRosterRecipients(input.messageJobId);
        break;
      }
    }
    if (input.provider === "directalk") {
      pendingCount = recipients.length - successCount - failedCount;
      for (const delayMs of DELIVERY_POLL_DELAYS_MS) {
        if (pendingCount === 0) break;
        await sleep(delayMs);
        const progress = await syncRosterDeliveryResults(input.messageJobId);
        successCount = progress.successCount;
        failedCount = progress.failedCount;
        pendingCount = progress.pendingCount;
      }
    }
    await finishRosterJob(
      input.messageJobId,
      successCount,
      failedCount,
      pendingCount,
    );
    console.info("[roster-message] workflow completed", {
      messageJobId: input.messageJobId,
      successCount,
      failedCount,
      pendingCount,
    });
    return { successCount, failedCount, pendingCount };
  } catch (error) {
    const reason = error instanceof Error ? error.message : "발송 워크플로 오류";
    await failRosterJob(input.messageJobId, reason);
    throw new Error(reason);
  }
}
