import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSupplyRequestUpdate,
  createSupplyRequestSchema,
  SupplyRequestConflictError,
} from "./model";

const ACTOR = "00000000-0000-4000-8000-000000000001";
const NOW = "2026-10-25T09:00:00.000Z";

test("비품 신청 입력은 원 단위 정수 가격과 필수 항목을 검증한다", () => {
  assert.equal(createSupplyRequestSchema.safeParse({
    itemName: "촬영용 삼각대",
    priceKrw: 120_000,
    purpose: "강의 촬영",
    note: "",
  }).success, true);
  assert.equal(createSupplyRequestSchema.safeParse({
    itemName: "삼각대",
    priceKrw: 12.5,
    purpose: "강의 촬영",
    note: "",
  }).success, false);
  assert.equal(createSupplyRequestSchema.safeParse({
    itemName: " ",
    priceKrw: 100,
    purpose: "강의 촬영",
    note: "",
  }).success, false);
});
test("승인 상태 변경은 검토 정보와 버전을 함께 갱신한다", () => {
  assert.deepEqual(buildSupplyRequestUpdate({
    approvalStatus: "pending",
    purchased: false,
    version: 2,
  }, {
    action: "approval",
    status: "approved",
    version: 2,
  }, ACTOR, NOW), {
    approval_status: "approved",
    reviewed_by: ACTOR,
    reviewed_at: NOW,
    version: 3,
    updated_at: NOW,
  });
});

test("승인 전 구매 완료와 구매 후 승인 취소를 차단한다", () => {
  assert.throws(() => buildSupplyRequestUpdate({
    approvalStatus: "pending",
    purchased: false,
    version: 1,
  }, {
    action: "purchase",
    purchased: true,
    version: 1,
  }, ACTOR, NOW), SupplyRequestConflictError);

  assert.throws(() => buildSupplyRequestUpdate({
    approvalStatus: "approved",
    purchased: true,
    version: 3,
  }, {
    action: "approval",
    status: "rejected",
    version: 3,
  }, ACTOR, NOW), SupplyRequestConflictError);
});
