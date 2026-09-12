import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { toOrderRecord } from "./server";
import type { CourseOrder } from "./types";

const courseId = "00000000-0000-4000-8000-000000000001";
const otherCourseId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000003";
const outsiderId = "00000000-0000-4000-8000-000000000004";
const row: CourseOrder = {
  productName: "실전 강의 - 기본반", optionName: "기본반", memberName: "수강생", phone: "01012345678",
  email: "test@example.com", paymentAmount: 500000, refundAmount: 0, currentAmount: 500000,
  status: "결제완료", paymentMethod: "카드", rs: "RS", adMedia: "유튜브", inflowType: "광고", paymentId: "p1", orderId: "o1", refundDate: "",
};

test("실제 SQL로 필드 저장·재업로드 갱신·강의 격리·실패 롤백·권한을 검증한다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role;
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id', true), '')::uuid $$;
      create table auth.users(id uuid primary key);
      create table public.courses(id uuid primary key, workspace_id uuid not null);
      create table public.workspace_members(workspace_id uuid, user_id uuid);
      insert into auth.users values ('${userId}'), ('${outsiderId}');
      insert into public.courses values ('${courseId}', '${courseId}'), ('${otherCourseId}', '${otherCourseId}');
      insert into public.workspace_members values ('${courseId}', '${userId}'), ('${otherCourseId}', '${outsiderId}');
      grant usage on schema public, auth to authenticated;
      grant select on public.courses, public.workspace_members to authenticated;
    `);
    await db.exec(await readFile("supabase/migrations/202609120001_course_orders.sql", "utf8"));
    const save = (records: unknown[], course = courseId, user = userId) => db.query(
      "select public.import_course_orders($1, $2, $3, $4::jsonb)", [course, user, "orders.xlsx", JSON.stringify(records)],
    );
    await save([toOrderRecord(row)]);
    const { rows: [stored] } = await db.query<Record<string, unknown>>("select * from course_orders");
    for (const [key, value] of Object.entries(toOrderRecord(row))) {
      assert.equal(stored[key] === null ? null : typeof value === "number" ? Number(stored[key]) : stored[key], value, key);
    }
    const updated = { ...row, refundAmount: 100000, currentAmount: 400000, refundDate: "2026-09-12", status: "부분환불" };
    await save([toOrderRecord(updated)]);
    assert.equal((await db.query("select id from course_orders")).rows.length, 1);
    const { rows: [refunded] } = await db.query<Record<string, unknown>>("select * from course_orders");
    assert.equal(refunded.id, stored.id);
    assert.equal(Number(refunded.refund_amount), 100000);
    assert.equal(Number(refunded.current_amount), 400000);
    assert.equal((refunded.refund_date as Date).toISOString().slice(0, 10), "2026-09-12");
    await save([toOrderRecord({ ...row, orderId: "o2", paymentId: "p2" })]);
    assert.equal((await db.query("select id from course_orders")).rows.length, 2);
    await save([toOrderRecord(row)], otherCourseId, outsiderId);
    assert.equal((await db.query("select id from course_orders where course_id = $1", [otherCourseId])).rows.length, 1);
    await assert.rejects(save([toOrderRecord(row)], otherCourseId), /권한/);
    const importCount = (await db.query("select id from course_order_imports")).rows.length;
    await assert.rejects(save([toOrderRecord({ ...row, orderId: "new" }), { ...toOrderRecord(row), current_amount: "invalid" }]), /numeric/);
    assert.equal((await db.query("select id from course_order_imports")).rows.length, importCount);
    assert.equal((await db.query("select id from course_orders")).rows.length, 3);
    await db.exec(`set role authenticated; select set_config('test.user_id', '${userId}', false);`);
    assert.equal((await db.query("select id from course_orders")).rows.length, 2);
    assert.equal((await db.query("select id from course_order_imports")).rows.length, 3);
    await assert.rejects(save([toOrderRecord(row)]), /permission denied/);
  } finally { await db.close(); }
});
