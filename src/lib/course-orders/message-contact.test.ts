import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { orderMessageBookId, prepareOrderMessageContact } from "./message-contact";

const course = { id: "10000000-0000-4000-8000-000000000001", name: "테스트 강의", workspace_id: "workspace" };
const orderId = "20000000-0000-4000-8000-000000000001";
function fixture(overrides: Record<string, unknown> = {}, failTable = "") {
  const row = { id: orderId, course_id: course.id, member_name: "수강생", phone: "+82 10 1234 5678", email: "student@example.com", status: "결제완료", ...overrides };
  const writes: { table: string; value: Record<string, unknown> }[] = [];
  const admin = { from(table: string) {
    const filters: Record<string, unknown> = {};
    let value: Record<string, unknown> | undefined;
    const query = {
      select() { return query; }, eq(key: string, target: unknown) { filters[key] = target; return query; },
      upsert(data: Record<string, unknown>, options: Record<string, unknown>) {
        if (table === "address_books") assert.equal(options.ignoreDuplicates, true);
        else assert.equal(options.onConflict, "address_book_id,normalized_phone");
        value = data; return query;
      },
      update(data: Record<string, unknown>) { value = data; return query; },
      single() { return query; }, maybeSingle() { return query; },
      then(resolve: (value: unknown) => unknown) {
        if (table === failTable) return Promise.resolve(resolve({ data: null, error: { code: "test" } }));
        if (value) writes.push({ table, value });
        if (table === "course_orders") {
          assert.equal(filters.course_id, course.id); assert.equal(filters.id, orderId);
          return Promise.resolve(resolve({ data: row.course_id === filters.course_id ? row : null, error: null }));
        }
        if (table === "address_books") return Promise.resolve(resolve({ data: { workspace_id: course.workspace_id }, error: null }));
        assert.equal(table, "address_book_contacts");
        return Promise.resolve(resolve({ data: { id: "contact-1" }, count: 1, error: null }));
      },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { admin, writes };
}

test("주문 연락처를 정규화하고 같은 강의의 발송용 주소록을 재사용한다", async () => {
  const { admin, writes } = fixture();
  const first = await prepareOrderMessageContact(admin, course, "user", orderId);
  assert.deepEqual(first, { bookId: orderMessageBookId(course.id), contactId: "contact-1" });
  assert.deepEqual(await prepareOrderMessageContact(admin, course, "user", orderId), first);
  const contact = writes.find(write => write.table === "address_book_contacts")!.value;
  assert.equal(contact.normalized_phone, "01012345678"); assert.equal(contact.name, "수강생");
  assert.equal(contact.email, "student@example.com"); assert.equal(contact.address_book_id, first.bookId);
  assert.notEqual(orderMessageBookId("other-course"), first.bookId);
  assert.ok(writes.every(write => ["address_books", "address_book_contacts"].includes(write.table)));
});

test("다른 강의·환불·전화번호 오류는 연락처를 만들기 전에 거부한다", async () => {
  for (const [overrides, message] of [
    [{ course_id: "other" }, /해당 강의/], [{ status: "전액환불" }, /결제완료/],
    [{ status: "결제완료 / 부분환불" }, /결제완료/], [{ phone: "02-123-4567" }, /전화번호/],
  ] as const) {
    const { admin, writes } = fixture(overrides);
    await assert.rejects(prepareOrderMessageContact(admin, course, "user", orderId), message);
    assert.equal(writes.length, 0);
  }
  const { admin } = fixture();
  await assert.rejects(prepareOrderMessageContact(admin, course, "user", "invalid"), /주문 ID/);
});

test("저장 실패 시 발송 화면으로 이동할 성공 응답을 만들지 않는다", async () => {
  for (const table of ["course_orders", "address_books", "address_book_contacts"]) {
    const { admin } = fixture({}, table);
    await assert.rejects(prepareOrderMessageContact(admin, course, "user", orderId));
  }
});
