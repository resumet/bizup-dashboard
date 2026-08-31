export const MESSAGE_DISPATCH_BATCH_SIZE = 20;

export function chunkMessageRecipients<T>(
  recipients: T[],
  batchSize = MESSAGE_DISPATCH_BATCH_SIZE,
) {
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error("발송 묶음 크기는 1 이상의 정수여야 합니다.");
  }

  const batches: T[][] = [];
  for (let start = 0; start < recipients.length; start += batchSize) {
    batches.push(recipients.slice(start, start + batchSize));
  }
  return batches;
}

export function resolveMessageJobStatus(successCount: number, failedCount: number) {
  if (failedCount === 0) return "completed" as const;
  if (successCount === 0) return "failed" as const;
  return "partial_failed" as const;
}

export function hasProcessingMessageJob(items: Array<{ status: string }>) {
  return items.some((item) => item.status === "processing");
}
