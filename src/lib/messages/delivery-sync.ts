import "server-only";

import { chunkMessageRecipients, resolveMessageJobStatus } from "./dispatch";
import { getMessageProvider } from "./provider";
import type {
  MessageBatchDeliveryResult,
  MessageRecipientDeliveryResult,
} from "./provider/types";
import type { MessageProviderBatchKind } from "./provider-batches";
import { createAdminClient } from "@/lib/supabase/admin";

type DeliveryStore = MessageProviderBatchKind;

type LegacyRecipientRow = {
  id: string;
  status: string;
  group_id: string | null;
  provider_result_code: string | null;
  delivery_checked_at: string | null;
};

type ProviderBatchRow = {
  id: string;
  status: string;
  recipient_count: number;
  group_id: string | null;
};

const DELIVERY_TABLES = {
  roster: {
    recipients: "message_recipients",
    jobs: "message_jobs",
  },
  "address-book": {
    recipients: "address_book_message_recipients",
    jobs: "address_book_message_jobs",
  },
} as const;
const MAX_LEGACY_RESULTS_PER_SYNC = 100;
const MAX_BATCHES_PER_SYNC = 10;
const BATCH_POLL_CONCURRENCY = 2;

async function loadLegacyDirectalkRecipients(
  store: DeliveryStore,
  messageJobId: string,
) {
  const admin = createAdminClient();
  const rows: LegacyRecipientRow[] = [];
  const table = DELIVERY_TABLES[store].recipients;

  for (let start = 0; ; start += 1_000) {
    const { data, error } = await admin
      .from(table)
      .select("id,status,group_id,provider_result_code,delivery_checked_at")
      .eq("message_job_id", messageJobId)
      .eq("provider", "directalk")
      .is("provider_batch_id", null)
      .range(start, start + 999);
    if (error) throw new Error(`기존 발송 결과 조회 실패: ${error.code}`);
    rows.push(...((data ?? []) as LegacyRecipientRow[]));
    if ((data?.length ?? 0) < 1_000) break;
  }

  return rows
    .filter(
      (row) =>
        row.status === "unknown" ||
        !row.delivery_checked_at ||
        (Boolean(row.group_id) && !row.provider_result_code),
    )
    .sort((left, right) => {
      if (!left.delivery_checked_at && !right.delivery_checked_at) return 0;
      if (!left.delivery_checked_at) return -1;
      if (!right.delivery_checked_at) return 1;
      return Date.parse(left.delivery_checked_at) - Date.parse(right.delivery_checked_at);
    })
    .slice(0, MAX_LEGACY_RESULTS_PER_SYNC);
}

async function countRecipientsByStatus(
  table: string,
  messageJobId: string,
  status: string,
) {
  const { count, error } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("message_job_id", messageJobId)
    .eq("provider", "directalk")
    .eq("status", status);
  if (error) throw new Error(`발송 결과 집계 실패: ${error.code}`);
  return count ?? 0;
}

async function countDirectalkRecipients(table: string, messageJobId: string) {
  const { count, error } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("message_job_id", messageJobId)
    .eq("provider", "directalk");
  if (error) throw new Error(`발송 결과 집계 실패: ${error.code}`);
  return count ?? 0;
}

function resultPayload(result: MessageRecipientDeliveryResult) {
  return {
    seq: result.seq,
    state: result.state,
    terminal: result.terminal,
    provider_status: result.providerStatus ?? null,
    result_code: result.code ?? null,
    result_message: result.reason ?? null,
    final_message_type: result.finalMessageType ?? null,
    correlation_id: result.correlationId ?? null,
  };
}

async function countBatchRecipients(table: string, batchId: string, status: string) {
  const { count, error } = await createAdminClient()
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("provider_batch_id", batchId)
    .eq("status", status);
  if (error) throw new Error(`DirecTalk 배치 결과 집계 실패: ${error.code}`);
  return count ?? 0;
}

async function saveBatchResult(
  store: DeliveryStore,
  batch: ProviderBatchRow,
  result: MessageBatchDeliveryResult,
) {
  const admin = createAdminClient();
  const recipientTable = DELIVERY_TABLES[store].recipients;
  const checkedAt = new Date().toISOString();

  if (result.recipients.length > 0) {
    const { data: updatedCount, error } = await admin.rpc(
      "apply_message_provider_batch_results",
      {
        p_batch_id: batch.id,
        p_results: result.recipients.map(resultPayload),
        p_checked_at: checkedAt,
      },
    );
    if (error || updatedCount !== result.recipients.length) {
      throw new Error(
        `DirecTalk 배치 상세 결과 저장 실패: ${error?.code ?? `${updatedCount}/${result.recipients.length}`}`,
      );
    }
  } else if (result.terminal && result.state === "failed") {
    const reason = result.reason ?? "DirecTalk 발송 그룹이 실패했습니다.";
    const { error } = await admin
      .from(recipientTable)
      .update({
        status: "failed",
        provider_status: result.providerStatus ?? "FAILED",
        provider_result_code: result.code ?? null,
        provider_result_message: reason,
        failure_reason: reason,
        delivery_checked_at: checkedAt,
        completed_at: checkedAt,
      })
      .eq("provider_batch_id", batch.id);
    if (error) throw new Error(`DirecTalk 그룹 실패 저장 실패: ${error.code}`);
  } else {
    const { error } = await admin
      .from(recipientTable)
      .update({
        provider_status: result.providerStatus ?? "UNKNOWN",
        provider_result_message: result.reason ?? null,
        delivery_checked_at: checkedAt,
      })
      .eq("provider_batch_id", batch.id)
      .in("status", ["pending", "unknown"]);
    if (error) throw new Error(`DirecTalk 그룹 상태 저장 실패: ${error.code}`);
  }

  const [successCount, failedCount] = await Promise.all([
    countBatchRecipients(recipientTable, batch.id, "success"),
    countBatchRecipients(recipientTable, batch.id, "failed"),
  ]);
  const awaitingCount = Math.max(
    0,
    batch.recipient_count - successCount - failedCount,
  );
  const completed = awaitingCount === 0;
  const status = completed
    ? resolveMessageJobStatus(successCount, failedCount)
    : result.state === "unknown"
      ? "unknown"
      : "processing";
  const { error: batchError } = await admin
    .from("message_provider_batches")
    .update({
      status,
      success_count: successCount,
      failed_count: failedCount,
      provider_status: result.providerStatus ?? null,
      provider_correlation_id: result.correlationId ?? null,
      failure_reason:
        result.state === "failed" || result.state === "unknown"
          ? result.reason ?? null
          : null,
      delivery_checked_at: checkedAt,
      completed_at: completed ? checkedAt : null,
      sync_started_at: null,
    })
    .eq("id", batch.id);
  if (batchError) throw new Error(`DirecTalk 배치 상태 저장 실패: ${batchError.code}`);
}

async function pollProviderBatch(
  store: DeliveryStore,
  batch: ProviderBatchRow,
) {
  const admin = createAdminClient();
  try {
    if (!batch.group_id) {
      const { error } = await admin
        .from("message_provider_batches")
        .update({ sync_started_at: null })
        .eq("id", batch.id);
      if (error) throw new Error(`DirecTalk 배치 잠금 해제 실패: ${error.code}`);
      return;
    }

    const provider = getMessageProvider("directalk");
    if (!provider.getBatchDeliveryResult) {
      throw new Error("DirecTalk 배치 결과 조회 기능이 설정되지 않았습니다.");
    }
    const result = await provider.getBatchDeliveryResult(batch.group_id);
    await saveBatchResult(store, batch, result);
  } catch (error) {
    await admin
      .from("message_provider_batches")
      .update({ sync_started_at: null })
      .eq("id", batch.id);
    throw error;
  }
}

async function syncProviderBatches(store: DeliveryStore, messageJobId: string) {
  const { data, error } = await createAdminClient().rpc(
    "claim_message_provider_batches",
    {
      p_job_kind: store,
      p_job_id: messageJobId,
      p_limit: MAX_BATCHES_PER_SYNC,
    },
  );
  if (error) throw new Error(`DirecTalk 배치 조회 잠금 실패: ${error.code}`);

  const batches = (data ?? []) as ProviderBatchRow[];
  for (const group of chunkMessageRecipients(batches, BATCH_POLL_CONCURRENCY)) {
    await Promise.all(group.map((batch) => pollProviderBatch(store, batch)));
  }
}

async function syncLegacyRecipients(store: DeliveryStore, messageJobId: string) {
  const config = DELIVERY_TABLES[store];
  const provider = getMessageProvider("directalk");
  if (!provider.getDeliveryResult) {
    throw new Error("DirecTalk 발송 결과 조회 기능이 설정되지 않았습니다.");
  }

  const recipients = await loadLegacyDirectalkRecipients(store, messageJobId);
  for (const batch of chunkMessageRecipients(recipients)) {
    await Promise.all(
      batch.map(async (recipient) => {
        const checkedAt = new Date().toISOString();
        if (!recipient.group_id) {
          if (recipient.status === "failed") {
            const { error } = await createAdminClient()
              .from(config.recipients)
              .update({
                provider_status: "REQUEST_FAILED",
                delivery_checked_at: checkedAt,
              })
              .eq("id", recipient.id);
            if (error) throw new Error(`발송 결과 저장 실패: ${error.code}`);
            return;
          }
          const reason =
            "DirecTalk groupId가 없어 실제 발송 결과를 조회할 수 없습니다.";
          const { error } = await createAdminClient()
            .from(config.recipients)
            .update({
              status: "unknown",
              provider_status: "GROUP_ID_MISSING",
              provider_result_message: reason,
              failure_reason: reason,
              delivery_checked_at: checkedAt,
              completed_at: null,
            })
            .eq("id", recipient.id);
          if (error) throw new Error(`발송 결과 저장 실패: ${error.code}`);
          return;
        }

        const result = await provider.getDeliveryResult!(recipient.group_id);
        const isSuccess = result.state === "success";
        const isFailed = result.state === "failed";
        const { error } = await createAdminClient()
          .from(config.recipients)
          .update({
            status: isSuccess ? "success" : isFailed ? "failed" : "unknown",
            provider_status: result.providerStatus ?? null,
            provider_result_code: result.code ?? null,
            provider_result_message: result.reason ?? null,
            final_message_type: result.finalMessageType ?? null,
            ...(result.correlationId
              ? { provider_correlation_id: result.correlationId }
              : {}),
            failure_reason: isFailed ? result.reason ?? "발송 실패" : null,
            delivery_checked_at: checkedAt,
            completed_at: result.terminal ? checkedAt : null,
          })
          .eq("id", recipient.id);
        if (error) throw new Error(`발송 결과 저장 실패: ${error.code}`);
      }),
    );
  }
}

export async function syncMessageDeliveryResults(
  store: DeliveryStore,
  messageJobId: string,
) {
  const config = DELIVERY_TABLES[store];
  await syncProviderBatches(store, messageJobId);
  await syncLegacyRecipients(store, messageJobId);

  const [successCount, failedCount, totalCount] = await Promise.all([
    countRecipientsByStatus(config.recipients, messageJobId, "success"),
    countRecipientsByStatus(config.recipients, messageJobId, "failed"),
    countDirectalkRecipients(config.recipients, messageJobId),
  ]);
  if (totalCount === 0) {
    const { error } = await createAdminClient()
      .from(config.jobs)
      .update({ delivery_checked_at: new Date().toISOString() })
      .eq("id", messageJobId);
    if (error) throw new Error(`발송 작업 결과 저장 실패: ${error.code}`);
    return {
      successCount: 0,
      failedCount: 0,
      pendingCount: 0,
      status: "unchanged" as const,
    };
  }

  const pendingCount = Math.max(0, totalCount - successCount - failedCount);
  const completedAt = pendingCount === 0 ? new Date().toISOString() : null;
  const status =
    pendingCount > 0
      ? "processing"
      : resolveMessageJobStatus(successCount, failedCount);
  const { error: jobError } = await createAdminClient()
    .from(config.jobs)
    .update({
      status,
      success_count: successCount,
      failed_count: failedCount,
      delivery_checked_at: new Date().toISOString(),
      completed_at: completedAt,
    })
    .eq("id", messageJobId);
  if (jobError) throw new Error(`발송 작업 결과 저장 실패: ${jobError.code}`);

  return { successCount, failedCount, pendingCount, status };
}
