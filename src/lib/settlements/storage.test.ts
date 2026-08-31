import assert from "node:assert/strict";
import test from "node:test";

import type { SettlementRow } from "./analysis";
import { parseStoredSettlementRows } from "./storage";

const row: SettlementRow = {
  platform: "플랫폼",
  settlementMonth: "2026-08",
  settlementDate: "2026-09-01",
  course: "AI 강의",
  instructor: "김강사",
  cohort: "1기",
  orderNumber: "ORDER-1",
  memberName: "홍길동",
  email: "hong@example.com",
  paymentDate: "2026-08-01",
  paymentAmount: 1000,
  salesAmount: 1000,
  installment: "일시불",
  pgFee: 30,
  pgFeeRate: "3",
  novaFee: 100,
  novaFeeRate: "10",
  settlementAmount: 870,
  paymentMethod: "카드",
  orderStatus: "결제완료",
  salesDate: "2026-08-01",
};

test("정산 저장 데이터의 전체 필드와 숫자값을 검증한다", () => {
  assert.deepEqual(parseStoredSettlementRows([row]), [row]);
  assert.throws(
    () => parseStoredSettlementRows([{ ...row, salesAmount: "1000" }]),
    /salesAmount/,
  );
  assert.throws(() => parseStoredSettlementRows([]), /데이터가 없습니다/);
});
