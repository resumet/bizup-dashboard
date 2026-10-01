import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPaymentSummaryUpdate,
  parsePaymentSummaryPatch,
} from "./payment-summary-patch";

test("기존 전체 정산 저장 요청을 계속 지원한다", () => {
  const patch = parsePaymentSummaryPatch({
    cohort: " 1 ",
    novaSettled: true,
    instructorSettled: false,
  });

  assert.deepEqual(patch, {
    cohort: "1",
    novaSettled: true,
    instructorSettled: false,
  });
  assert.deepEqual(buildPaymentSummaryUpdate(patch), {
    cohort: "1",
    nova_settled: true,
    instructor_settled: false,
  });
});

test("한 정산 체크를 저장해도 기수와 다른 정산 체크를 덮어쓰지 않는다", () => {
  const course = { cohort: "3", nova_settled: true, instructor_settled: true };
  const novaUpdate = buildPaymentSummaryUpdate(
    parsePaymentSummaryPatch({ novaSettled: false }),
  );
  const instructorUpdate = buildPaymentSummaryUpdate(
    parsePaymentSummaryPatch({ instructorSettled: false }),
  );

  assert.deepEqual(novaUpdate, { nova_settled: false });
  assert.deepEqual(instructorUpdate, { instructor_settled: false });
  assert.deepEqual({ ...course, ...novaUpdate }, {
    cohort: "3",
    nova_settled: false,
    instructor_settled: true,
  });
  assert.deepEqual({ ...course, ...instructorUpdate }, {
    cohort: "3",
    nova_settled: true,
    instructor_settled: false,
  });
  assert.deepEqual({ ...course, ...novaUpdate, ...instructorUpdate }, {
    cohort: "3",
    nova_settled: false,
    instructor_settled: false,
  });
});

test("명시적으로 보낸 빈 기수와 최대 100자 기수를 허용한다", () => {
  assert.deepEqual(buildPaymentSummaryUpdate(parsePaymentSummaryPatch({ cohort: " " })), {
    cohort: "",
  });
  assert.deepEqual(parsePaymentSummaryPatch({ cohort: "가".repeat(100) }), {
    cohort: "가".repeat(100),
  });
});

test("빈 요청, 배열, null, 잘못된 필드 타입과 긴 기수를 거절한다", () => {
  for (const input of [
    null,
    undefined,
    [],
    [{ novaSettled: true }],
    true,
    "value",
    1,
    {},
    { unrelated: true },
    { cohort: null },
    { cohort: 1 },
    { cohort: "가".repeat(101) },
    { novaSettled: "true" },
    { novaSettled: 0 },
    { novaSettled: undefined },
    { instructorSettled: null },
    { instructorSettled: "false" },
    { novaSettled: true, instructorSettled: 1 },
  ]) {
    assert.throws(() => parsePaymentSummaryPatch(input), /정산 정보 형식/);
  }
});
