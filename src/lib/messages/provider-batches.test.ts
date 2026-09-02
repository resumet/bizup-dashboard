import assert from "node:assert/strict";
import test from "node:test";

import {
  deterministicProviderBatchId,
  providerBatchIdempotencyKey,
} from "./provider-batches";

test("공급자 배치 ID와 멱등성 키는 같은 작업·청크에서 일정하다", () => {
  const first = deterministicProviderBatchId("roster", "job-1", 2);
  const second = deterministicProviderBatchId("roster", "job-1", 2);

  assert.equal(first, second);
  assert.match(first, /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/);
  assert.equal(
    providerBatchIdempotencyKey("roster", "job-1", 2),
    "roster:job-1:batch:2",
  );
});
