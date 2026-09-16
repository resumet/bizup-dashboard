import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadJobEnrollmentRows } from "./server";
import { compareRosters, findRosterDuplicates } from "@/lib/roster-comparison/compare";
import { loadComparisonStudents } from "@/lib/roster-comparison/server";
import { compareRosterRecords, buildUpdatedRosterRecords } from "@/lib/import/roster-diff";
import type { StoredRosterRecord } from "@/lib/import/roster";
import { refundDate } from "./refund";

const values = { customerName: "환불회원", phone: "01012345678", email: "refund@example.com", courseName: "강의", optionName: "", referrer: "", source: "", adMedia: "" };
const refundedAt = "2026-09-14T03:00:00.000Z";
const records = [{ id: "active", normalized_phone: "01099998888", normalized_values: values }, { id: "refund", normalized_phone: "01012345678", normalized_values: { ...values, refundedAt } }];
const query = { select: () => query, eq: () => query, order: () => query, range: async () => ({ data: records, error: null }) };
const client = { from: (table: string) => table === "course_jobs" ? { select: () => ({ in: () => ({ eq: async () => ({ data: [{ id: "job", name: "강의", latest_version: 1 }] }) }) }) } : query } as unknown as SupabaseClient;

test("환불자는 기본 조회·비교 대상에서 빠지고 조회 전용 화면에서만 포함된다", async () => {
  assert.deepEqual((await loadJobEnrollmentRows(client, "job", 1)).map((row) => row.id), ["active"]);
  assert.equal((await loadJobEnrollmentRows(client, "job", 1, true)).length, 2);
  assert.equal((await loadComparisonStudents(client, ["job"])).length, 1);
  assert.equal((await loadComparisonStudents(client, ["job"], true)).filter((row) => row.refunded).length, 1);
});

test("환불자를 결제자 누락으로 보고하지 않고 중복 검사에서도 제외한다", () => {
  const contact = { name: "환불회원", phone: "01012345678", email: "refund@example.com", source: "명단", rowNumber: 2 };
  for (const key of ["phone", "email"] as const) {
    const result = compareRosters([contact], [{ ...contact, refunded: true }], key);
    assert.equal(result.payerOnly.length + result.studentOnly.length + result.matchedCount, 0);
    assert.equal(findRosterDuplicates([contact, { ...contact, refunded: true }], key).duplicates.length, 0);
    assert.equal(compareRosters([contact], [contact, { ...contact, refunded: true }], key).matchedCount, 1);
  }
});

test("명단 재업로드 시 환불자는 비교에서 제외되고 원본 환불 기록을 보존한다", () => {
  const incoming: StoredRosterRecord = { normalizedPhone: "01012345678", sourceRowNumber: 2, normalizedValues: values, originalValues: {}, isDuplicate: false };
  const refunded = { ...incoming, normalizedValues: { ...values, refundedAt } };
  const diff = compareRosterRecords([refunded], [incoming]);
  assert.equal(diff.matches.length + diff.additions.length + diff.removals.length, 0);
  for (const source of [[], [incoming]]) {
    assert.deepEqual(buildUpdatedRosterRecords([refunded], source, { approveAdditions: true, approveRemovals: true }), [refunded]);
  }
});

test("명단 재업로드 시 보존한 환불 기록에도 새 버전의 고유 행 번호를 부여한다", () => {
  const active: StoredRosterRecord = {
    normalizedPhone: "01099998888",
    sourceRowNumber: 14,
    normalizedValues: { ...values, customerName: "일반회원", phone: "01099998888" },
    originalValues: {},
    isDuplicate: false,
  };
  const refunded = {
    normalizedPhone: "01012345678",
    sourceRowNumber: 14,
    normalizedValues: { ...values, refundedAt },
    originalValues: {},
    isDuplicate: false,
  };

  const updated = buildUpdatedRosterRecords([active, refunded], [active], {
    approveAdditions: true,
    approveRemovals: true,
  });

  assert.deepEqual(updated.map((record) => record.sourceRowNumber), [2, 3]);
  assert.equal(refundDate(updated[1].normalizedValues), refundedAt);
});
