export const MESSAGE_DISPATCH_BATCH_SIZE = 20;
export const DIRECTALK_MESSAGE_BATCH_SIZE = 500;

export function messageDispatchBatchSize(provider: string) {
  return provider === "directalk"
    ? DIRECTALK_MESSAGE_BATCH_SIZE
    : MESSAGE_DISPATCH_BATCH_SIZE;
}

export function dedupeMessageRecipientsByPhone<T>(
  recipients: T[],
  phoneOf: (recipient: T) => string,
) {
  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const phone = phoneOf(recipient).replace(/\D/gu, "");
    if (seen.has(phone)) return false;
    seen.add(phone);
    return true;
  });
}

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
