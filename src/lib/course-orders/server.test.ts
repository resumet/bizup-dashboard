import assert from "node:assert/strict";
import test from "node:test";
import { loadCourseOrders, readCourseOrderUpload, saveCourseOrders, toOrderRecord } from "./server";
import type { CourseOrder } from "./types";
import { COURSE_ORDER_HEADERS, parseCourseOrders } from "./parse";

test("조회는 1,000건 제한을 넘어 모든 페이지를 읽고 저장 필드를 복원한다", async () => {
  const values: Record<string, unknown> = {
    주문항목명: "강의 - 옵션", 회원명: "회원", 휴대전화번호: "01012345678", 이메일: "test@example.com",
    결제금액: 1000, 환불금액: 100, "현 결제금액": 900, 주문상태: "부분환불", 결제방법: "카드",
    RS: "rs", "트래킹 광고 매체": "검색", "트래킹 유입 구분": "광고", 결제ID: "p1", 환불일: "2026-09-12",
  };
  const [row] = parseCourseOrders([[...COURSE_ORDER_HEADERS], COURSE_ORDER_HEADERS.map((key) => values[key])]);
  const records = Array.from({ length: 1001 }, (_,index) => ({ ...toOrderRecord(row), id: String(index), updated_at: "2026-09-12T00:00:00Z" }));
  const ranges: number[][] = [];
  const admin = {
    from: (table: string) => ({ select: () => ({ eq: (key: string, courseId: string) => {
      assert.equal(key, "course_id"); assert.equal(courseId, "course-1");
      return { order: () => ({
        range: async (start: number, end: number) => { ranges.push([start, end]); return { data: records.slice(start, end + 1), error: null }; },
        limit: async () => {
          assert.equal(table, "course_order_imports");
          return { data: [{ id: "import", file_name: "orders.xlsx", row_count: 1001, created_at: "2026-09-12T00:00:00Z" }], error: null };
        },
      }) };
    } }) }),
  } as unknown as Parameters<typeof loadCourseOrders>[0];
  const result = await loadCourseOrders(admin, "course-1");
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]]);
  assert.equal(result.orders.length, 1001);
  assert.deepEqual(result.orders.find((item) => item.id === "0"), { ...row, id: "0", updatedAt: "2026-09-12T00:00:00Z" });
  assert.deepEqual(result.imports[0], { id: "import", fileName: "orders.xlsx", rowCount: 1001, createdAt: "2026-09-12T00:00:00Z" });
});

test("업로드 API는 확장자·크기·손상된 엑셀을 검증한다", async () => {
  for (const [name, bytes, message] of [
    ["orders.csv", new Uint8Array(10), /xlsx 파일/],
    ["orders.xlsx", new Uint8Array(0), /4MB 이하/],
    ["orders.xlsx", new Uint8Array(4 * 1024 * 1024 + 1), /4MB 이하/],
    ["orders.xlsx", new Uint8Array([1,2,3]), /파일을 읽지 못했습니다/],
  ] as const) {
    const form = new FormData(); form.set("file", new File([bytes], name));
    await assert.rejects(readCourseOrderUpload(form), message);
  }
});

test("새 주문 파일을 저장한 뒤 이전 파일에서만 남은 주문을 정리한다", async () => {
  const calls: unknown[] = [];
  const cleanup = {
    eq: (column: string, value: string) => {
      calls.push(["eq", column, value]);
      return cleanup;
    },
    neq: async (column: string, value: string) => {
      calls.push(["neq", column, value]);
      return { error: null };
    },
  };
  const admin = {
    rpc: async (name: string, input: unknown) => {
      calls.push(["rpc", name, input]);
      return { data: "00000000-0000-4000-8000-000000000099", error: null };
    },
    from: (table: string) => {
      calls.push(["from", table]);
      return { delete: () => cleanup };
    },
  } as unknown as Parameters<typeof saveCourseOrders>[0];
  const order: CourseOrder = {
    productName: "강의 - 기본반", optionName: "기본반", memberName: "수강생",
    phone: "01012345678", email: "student@example.com", paymentAmount: 1000,
    refundAmount: 0, currentAmount: 1000, status: "결제완료", paymentMethod: "카드",
    rs: "", adMedia: "", inflowType: "", paymentId: "payment", refundDate: "", orderId: "order",
  };

  await saveCourseOrders(admin, "00000000-0000-4000-8000-000000000001", "user", "orders.xlsx", [order]);

  assert.deepEqual(calls.slice(-3), [
    ["from", "course_orders"],
    ["eq", "course_id", "00000000-0000-4000-8000-000000000001"],
    ["neq", "import_id", "00000000-0000-4000-8000-000000000099"],
  ]);
});
