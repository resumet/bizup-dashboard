import assert from "node:assert/strict";
import test from "node:test";
import { attachmentType, ledgerCourseLabel, entrySchema, formatMoney, moneyInput, settingsSchema, summarizeLedger, visibleEntries, type Entry, type LedgerState } from "./model";
const partyId = "00000000-0000-4000-8000-000000000001";
const entry = (changes: Partial<Entry> = {}): Entry => ({ id: "e1", number: 1, version: 1, kind: "income", title: "강의 대금", partyId, courseId: null, amount: 200000, entryDate: "2026-10-15", note: "입금 확인", ...changes });
const state: LedgerState = { settings: { startDate: "2026-10-14", openingBalance: 1000000, version: 1 }, entries: [entry({ id: "e3", number: 3, entryDate: "2026-10-16", kind: "expense", amount: 30000 }), entry({ id: "e2", number: 2, kind: "expense", amount: 50000, title: "강사비", courseId: "c1" }), entry()], parties: [{ id: partyId, name: "김거래처", bankName: "은행", accountNumber: "001-002", accountHolder: "김강사", note: "", version: 1 }], courses: [{ id: "c1", name: "마케팅 실전", status: "completed", instructor_name: "김강사", cohort: "2" }], attachments: [] };
test("시작 잔고, 입금 가산, 지출 차감, 동일 날짜 마감 잔액과 최신 날짜 정렬", () => {
  const result = summarizeLedger(state.settings, state.entries);
  assert.equal(result.balance, BigInt(1120000));
  assert.equal(result.income, BigInt(200000)); assert.equal(result.expense, BigInt(80000));
  assert.equal(result.balances.get("2026-10-15"), BigInt(1150000));
  assert.deepEqual(visibleEntries(state, "").map(e => e.id), ["e3", "e2", "e1"]);
  assert.deepEqual(state.entries.map(e => e.id), ["e3", "e2", "e1"]);
});
test("제목·거래처·종료 강의명·쉼표 금액·비고 검색은 잔액을 바꾸지 않는다", () => {
  for (const query of ["대금", "김거래처", "마케팅", "200,000", "200000원", "입금 확인"]) assert.ok(visibleEntries(state, query).length > 0, query);
  assert.equal(visibleEntries(state, "없는 내용").length, 0);
  assert.equal(summarizeLedger(state.settings, state.entries).balance, BigInt(1120000));
});
test("과거 내역 수정·삭제와 시작 잔고 변경을 모든 이후 날짜에 반영한다", () => {
  const changed = state.entries.map(e => e.id === "e1" ? { ...e, amount: 100000, entryDate: "2026-10-14" } : e);
  assert.equal(summarizeLedger({ ...state.settings!, openingBalance: 0 }, changed).balances.get("2026-10-16"), BigInt(20000));
  assert.equal(summarizeLedger(state.settings, state.entries.filter(e => e.id !== "e1")).balance, BigInt(920000));
  assert.equal(summarizeLedger(null, []).balance, BigInt(0));
});
test("큰 금액 합산도 정수 정밀도를 잃지 않고 쉼표를 표시한다", () => {
  const rows = Array.from({ length: 10000 }, (_, index) => entry({ id: String(index), amount: 999999999999 }));
  assert.equal(formatMoney(summarizeLedger(null, rows).balance), "9,999,999,999,990,000");
  assert.equal(moneyInput("1234567"), "1,234,567"); assert.equal(moneyInput("-1234", true), "-1,234");
});
test("강의 미선택 허용, 잘못된 날짜·금액·거래처 입력 거부", () => {
  assert.ok(entrySchema.safeParse(entry()).success);
  for (const changes of [{ amount: 0 }, { amount: -1 }, { amount: 1.2 }, { amount: 1000000000001 }, { entryDate: "2026-02-30" }, { title: " " }, { partyId: "" }]) assert.equal(entrySchema.safeParse(entry(changes)).success, false);
  assert.ok(settingsSchema.safeParse({ startDate: "2024-02-29", openingBalance: -100, version: null }).success);
});
test("붙여넣기 PNG·PDF·CSV 허용, 실행파일·타입 위장·빈 파일·초과 크기 거부", () => {
  assert.equal(attachmentType({ name: "image.png", type: "image/png", size: 50 }).mime, "image/png");
  assert.equal(attachmentType({ name: "receipt.PDF", type: "", size: 50 }).mime, "application/pdf");
  assert.equal(attachmentType({ name: "data.csv", type: "application/vnd.ms-excel", size: 50 }).mime, "text/csv");
  for (const changes of [{ name: "file.exe" }, { type: "text/html" }, { size: 0 }, { size: 4194305 }]) assert.throws(() => attachmentType({ name: "image.png", type: "image/png", size: 50, ...changes }));
});

test("입출금 강의 표시는 모든 상태·강사·강의명·기수를 포함한다", () => {
  for (const [status, label] of [["ongoing", "진행"], ["on_hold", "보류"], ["completed", "완료"], ["canceled", "취소"]]) {
    assert.equal(ledgerCourseLabel({ ...state.courses[0], status }), `(${label})김강사-마케팅 실전-2기`);
  }
  assert.equal(ledgerCourseLabel({ ...state.courses[0], cohort: " 2기 " }), "(완료)김강사-마케팅 실전-2기");
  assert.equal(ledgerCourseLabel({ ...state.courses[0], cohort: null, instructor_name: "" }), "(완료)강사 미입력-마케팅 실전-기수 미입력");
});
