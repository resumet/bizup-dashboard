import { createHash } from "node:crypto";

export type MessageProviderBatchKind = "roster" | "address-book";

export function deterministicProviderBatchId(
  kind: MessageProviderBatchKind,
  messageJobId: string,
  chunkIndex: number,
) {
  const hex = createHash("sha256")
    .update(`${kind}:${messageJobId}:${chunkIndex}`)
    .digest("hex")
    .slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function providerBatchIdempotencyKey(
  kind: MessageProviderBatchKind,
  messageJobId: string,
  chunkIndex: number,
) {
  return `${kind}:${messageJobId}:batch:${chunkIndex}`;
}
