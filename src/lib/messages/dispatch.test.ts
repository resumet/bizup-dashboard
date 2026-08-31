import assert from "node:assert/strict";
import test from "node:test";

import {
  chunkMessageRecipients,
  hasProcessingMessageJob,
  resolveMessageJobStatus,
} from "./dispatch";

test("20,195명 발송 대상을 20명씩 빠짐없이 1,010개 묶음으로 나눈다", () => {
  const recipients = Array.from({ length: 20_195 }, (_, index) => index + 1);
  const batches = chunkMessageRecipients(recipients);

  assert.equal(batches.length, 1_010);
  assert.equal(batches[0].length, 20);
  assert.equal(batches.at(-1)?.length, 15);
  assert.deepEqual(batches.flat(), recipients);
});

test("발송 성공·실패 수에 맞춰 최종 작업 상태를 계산한다", () => {
  assert.equal(resolveMessageJobStatus(10, 0), "completed");
  assert.equal(resolveMessageJobStatus(0, 10), "failed");
  assert.equal(resolveMessageJobStatus(7, 3), "partial_failed");
});

test("진행 중인 발송 이력이 있을 때만 자동 갱신 대상으로 판단한다", () => {
  assert.equal(hasProcessingMessageJob([{ status: "completed" }]), false);
  assert.equal(
    hasProcessingMessageJob([{ status: "completed" }, { status: "processing" }]),
    true,
  );
});
