import assert from "node:assert/strict";
import test from "node:test";
import { createOrderStudentCsv, createOrderStudentRoster, normalizeOrderStudentPhone, formatOrderStudentPhone, maskOrderStudentEmail, maskOrderStudentName, maskOrderStudentPhone, maskOrderStudentsForPublic, summarizeOrderStudents } from "./student-roster";
import type { SavedCourseOrder } from "./types";

const order: SavedCourseOrder = {
  id: "order-1", updatedAt: "2026-09-15T00:00:00Z", productName: "강의 - 기본반",
  memberName: "김학생", phone: "01012345678", email: "student@example.com", optionName: "기본반",
  paymentAmount: 123456.78, refundAmount: 0, currentAmount: 123456.78, status: "결제완료",
  paymentMethod: "카드", rs: "", adMedia: "", inflowType: "광고 유입", paymentId: "payment-1", orderId: "source-1", refundDate: "",
};

test("결제완료 주문만 포함하고 원본 결제정보·RS·전화번호를 보존한다", () => {
  const statuses = ["결제완료", " 결제완료 ", "부분환불", "전액환불", "결제대기", "취소", "미결제완료", "결제완료 / 부분환불", ""];
  const rows = statuses.map((status, index) => ({ ...order, id: String(index), status }));
  assert.deepEqual(createOrderStudentRoster(rows), ["0", "1"].map((orderId) => ({
    orderId, name: "김학생", phone: "01012345678", email: "student@example.com", optionName: "기본반", inflowType: "광고 유입", amount: 123456.78,
    paymentMethod: "카드", rs: "", paymentId: "payment-1",
  })));
  assert.equal(rows.length, statuses.length);
});

test("같은 사람의 다른 주문·옵션과 연락처가 없는 결제완료 주문도 누락하지 않는다", () => {
  const rows = createOrderStudentRoster([
    order, { ...order, id: "order-2", optionName: "심화반", paymentAmount: 200000 },
    { ...order, id: "order-3", memberName: "", phone: "", email: "", optionName: "", paymentAmount: 0 },
  ]);
  assert.equal(rows.length, 3);
  assert.equal(rows[1].optionName, "심화반");
  assert.equal(rows[1].amount, 200000);
  assert.equal(rows[2].phone, "");
  assert.equal(rows[2].amount, 0);
  assert.deepEqual(createOrderStudentRoster([]), []);
  assert.deepEqual(createOrderStudentRoster([{ ...order, status: "전액환불" }]), []);
});

test("전화번호의 국가번호·누락된 0을 정규화하고 다른 번호를 임의로 만들지 않는다", () => {
  for (const phone of ["01012345678", "010-1234-5678", "+82 10 1234 5678", "0082-10-1234-5678", "1012345678", "０１０１２３４５６７８"]) {
    assert.equal(normalizeOrderStudentPhone(phone), "01012345678");
    assert.equal(formatOrderStudentPhone(phone), "010-1234-5678");
  }
  for (const phone of ["", "02-123-4567", "010123", "01012345678 / 01087654321", "abc01012345678"]) assert.equal(normalizeOrderStudentPhone(phone), "");
  assert.equal(formatOrderStudentPhone("02-123-4567"), "02-123-4567");
});

test("옵션별 인원은 중복을 제외하고 매출·기여도는 모든 주문 금액을 합산한다", () => {
  const students = createOrderStudentRoster([
    { ...order, paymentAmount: 100.10 }, { ...order, id: "2", phone: "+82 10 1234 5678", paymentAmount: 100.20 },
    { ...order, id: "3", optionName: "심화반", paymentAmount: 300.30 },
    { ...order, id: "4", optionName: "", phone: "", email: "other@example.com", paymentAmount: 100.10 },
  ]);
  const result = summarizeOrderStudents(students);
  assert.equal(result.people, 2); assert.equal(result.count, 4); assert.equal(result.amount, 600.70);
  const basic = result.options.find(item => item.optionName === "기본반")!;
  assert.equal(basic.people, 1); assert.equal(basic.count, 2); assert.equal(basic.amount, 200.30);
  assert.equal(basic.contribution, 20030 / 60070 * 100);
  assert.equal(result.options.find(item => item.optionName === "")?.people, 1);
  assert.deepEqual(result.inflowTypes, [{ inflowType: "광고 유입", people: 2, count: 4 }]);
  assert.ok(Math.abs(result.options.reduce((sum, item) => sum + item.contribution!, 0) - 100) < 1e-9);
  assert.equal(summarizeOrderStudents([{ ...students[0], amount: 0 }]).options[0].contribution, null);
  assert.deepEqual(summarizeOrderStudents([]), { people: 0, count: 0, amount: 0, options: [], inflowTypes: [] });
});

test("공개 명단에 결제ID와 내부 RS 정보가 전달되지 않는다", () => {
  const [publicRow] = maskOrderStudentsForPublic(createOrderStudentRoster([{...order,rs:"내부 RS"}]));
  assert.equal("paymentId" in publicRow,false);
  assert.equal("rs" in publicRow,false);
  assert.equal(publicRow.name,"김*생");
});

test("공개 명단의 이름·전화번호·이메일을 마스킹한다", () => {
  assert.equal(maskOrderStudentName("최지원"), "최*원");
  assert.equal(maskOrderStudentName("김철"), "김*");
  assert.equal(maskOrderStudentName("남궁민수"), "남**수");
  assert.equal(maskOrderStudentName("김"), "*");
  assert.equal(maskOrderStudentName(""), "—");
  assert.equal(maskOrderStudentPhone("010-1234-5678"), "010-****-5678");
  assert.equal(maskOrderStudentPhone("+82 10 1234 5678"), "010-****-5678");
  assert.equal(maskOrderStudentPhone("invalid"), "****");
  assert.equal(maskOrderStudentPhone(""), "—");
  assert.equal(maskOrderStudentEmail("cjw94130@hanmail.net"), "********@hanmail.net");
  assert.equal(maskOrderStudentEmail("invalid"), "****");
  assert.equal(maskOrderStudentEmail(""), "—");
  const masked = maskOrderStudentsForPublic(createOrderStudentRoster([order]))[0];
  assert.equal(masked.name, "김*생");
  assert.equal(masked.phone, "010-****-5678");
  assert.equal(masked.email, "*******@example.com");
});

test("트래킹 유입구분별 인원은 같은 사람의 중복 결제를 제외한다", () => {
  const students = createOrderStudentRoster([
    order,
    { ...order, id: "2" },
    { ...order, id: "3", inflowType: "검색 유입" },
    { ...order, id: "4", phone: "01099998888", email: "other@example.com", inflowType: "검색 유입" },
    { ...order, id: "5", phone: "01077776666", email: "none@example.com", inflowType: "" },
  ]);
  assert.deepEqual(summarizeOrderStudents(students).inflowTypes, [
    { inflowType: "검색 유입", people: 2, count: 2 },
    { inflowType: "", people: 1, count: 1 },
    { inflowType: "광고 유입", people: 1, count: 2 },
  ]);
});

test("공개 명단 CSV에 트래킹 유입구분을 포함하고 엑셀 수식 실행을 막는다", () => {
  const csv = createOrderStudentCsv([{
    ...createOrderStudentRoster([order])[0],
    name: '=HYPERLINK("https://example.com")',
    inflowType: "유튜브, 광고",
  }]);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"트래킹 유입구분"'));
  assert.ok(csv.includes('"결제금액"'));
  assert.equal(csv.includes("HYPERLINK"), false);
  assert.ok(csv.includes('"\'='));
  assert.ok(csv.includes('"유튜브, 광고"'));
  assert.ok(csv.includes('"010-****-5678"'));
  assert.ok(csv.includes('"*******@example.com"'));
  assert.ok(csv.includes('"123456.78"'));
});
