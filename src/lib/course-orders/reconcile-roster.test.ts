import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { planPaidRoster, type ReconcileOrder, type ReconcileEnrollment, type RosterSnapshot } from "./reconcile-roster";

const order = (id: string, extra: Partial<ReconcileOrder> = {}): ReconcileOrder => ({
  id, record_key: id, member_name: "검증학생", phone: "01012345678", email: "test@example.test",
  status: "결제완료", current_amount: 120000, refund_amount: 0, payment_amount: 120000, option_name: "기본반", ...extra,
});
const enrollment = (id: string, values: Record<string, unknown> = {}): ReconcileEnrollment => ({
  id, source_row_number: 2, normalized_phone: "01012345678", student_id: null, is_extra_participant: false, is_manually_added: false,
  original_values: {}, normalized_values: { customerName: "검증학생", phone: "01012345678", email: "test@example.test", optionName: "기본반", paymentAmount: "120000", orderRecordKey: id, ...values },
});
const state = (orders: ReconcileOrder[], enrollments: ReconcileEnrollment[]): RosterSnapshot => ({ courseName: "강의", jobId: "job", version: 1, orders, enrollments });
const refund = order("old", { status: "전액환불", current_amount: 0, refund_amount: 120000 });

test("환불 후 재결제는 기존 결제자와 연결하며 실제 수강생 연락처를 매칭에 쓰지 않는다", () => {
  const old = enrollment("old", { customerName: "수정한 이름", hasDifferentStudent: true, studentName: "실제학생", studentPhone: "01099998888", groupChatJoined: true });
  const before = structuredClone(old);
  const plan = planPaidRoster(state([refund, order("new", { phone: "+82 10-1234-5678", option_name: "심화반", payment_amount: 150000 })], [old]), ["new"]);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].kind, "update");
  assert.equal(plan.changes[0].targetId, "old");
  assert.deepEqual(plan.changes[0].after, { optionName: "심화반", paymentAmount: 150000 });
  assert.deepEqual(old, before); // Preview is read-only.
});

test("이미 생긴 중복은 환불 전 명단을 유지하고 재결제 추가분만 정리하도록 제안한다", () => {
  const plan = planPaidRoster(state([refund, order("new")], [enrollment("old", { memo: "보존" }), enrollment("new")]), ["new"]);
  assert.equal(plan.changes[0].kind, "merge");
  assert.equal(plan.changes[0].targetId, "old");
  assert.deepEqual(plan.changes[0].removeIds, ["new"]);
  const updated = enrollment("old", { orderRecordKey: "new" });
  assert.equal(planPaidRoster(state([refund, order("new")], [updated]), ["new"]).unchangedCount, 1);
});

test("동명이인·정상 다중구매는 합치지 않고 모호하거나 별도 편집된 중복은 보류한다", () => {
  assert.equal(planPaidRoster(state([refund, order("new", { phone: "01088887777" })], [enrollment("old")]), ["new"]).changes[0].kind, "add");
  assert.equal(planPaidRoster(state([order("old"), order("new")], [enrollment("old")]), ["new"]).changes[0].kind, "add");
  for (const snapshot of [
    state([refund, order("new"), order("another")], [enrollment("old")]),
    state([refund, order("new")], [enrollment("old"), enrollment("new", { memo: "새 기록에도 메모" })]),
    state([order("new")], [enrollment("old")]),
    state([refund, order("new")], [enrollment("old", { refundedAt: "2026-09-15" })]),
  ]) {
    const plan = planPaidRoster(snapshot, ["new"]);
    assert.equal(plan.changes.length, 0);
    assert.equal(plan.conflicts.length, 1);
  }
});

test("부분환불·입금대기는 재결제 연결 대상으로 오인하지 않는다", () => {
  const partial = order("old", { status: "부분환불", current_amount: 100000, refund_amount: 20000 });
  assert.equal(planPaidRoster(state([partial, order("new")], [enrollment("old")]), ["new"]).changes[0].kind, "add");
  assert.equal(planPaidRoster(state([order("pending", { status: "입금대기" })], []), ["pending"]).changes.length, 0);
});

test("선택 반영은 가격·옵션만 수정하고 개인 정보 보존, 중복 정리, 이력, 동시 수정 검증을 원자적으로 수행한다", async () => {
  const db = new PGlite();
  const actor = randomUUID(), outsider = randomUUID(), workspace = randomUUID(), course = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;`);
    const foundation = await readFile("supabase/migrations/202608260001_foundation.sql", "utf8");
    await db.exec(foundation.split("create function public.handle_new_user")[0].replace('create extension if not exists "pgcrypto";', ""));
    await db.exec(`create table public.courses(id uuid primary key, workspace_id uuid not null references workspaces, name text not null);
      alter table public.course_jobs add column course_id uuid references public.courses on delete set null;
      alter table public.job_enrollments add column is_extra_participant boolean not null default false, add column is_manually_added boolean not null default false;
      create unique index on public.job_enrollments(job_id,version,source_row_number);`);
    for (const name of ["202609120001_course_orders", "202609160002_paid_course_rosters", "202609160005_paid_roster_reconciliation"]) {
      await db.exec(await readFile(`supabase/migrations/${name}.sql`, "utf8"));
    }
    await db.query("insert into auth.users values($1),($2)", [actor, outsider]);
    await db.query("insert into workspaces(id,name) values($1,'Test')", [workspace]);
    await db.query("insert into workspace_members(workspace_id,user_id) values($1,$2)", [workspace, actor]);
    await db.query("insert into courses values($1,$2,'검증 강의')", [course, workspace]);
    const importId = (await db.query<{ id: string }>("insert into course_order_imports(course_id,file_name,row_count) values($1,'test.xlsx',3) returning id", [course])).rows[0].id;
    const insert = async (key: string, phone = "01012345678") => (await db.query<{ id: string }>(`insert into course_orders(course_id,record_key,product_name,option_name,member_name,phone,email,payment_amount,refund_amount,current_amount,status,payment_method,rs,payment_id,import_id)
      values($1,$2,'강의','기본반','검증학생',$3,'test@example.test',120000,0,120000,'결제완료','카드','기존 RS','old-payment',$4) returning id`, [course, key, phone, importId])).rows[0].id;
    const snapshot = async () => (await db.query<{ s: RosterSnapshot }>("select paid_roster_snapshot($1,$2) s", [course, actor])).rows[0].s;
    const apply = async (s: RosterSnapshot, ids: string[], who = actor) => {
      const ops = planPaidRoster(s, ids).changes.map(({ orderId, targetId, removeIds }) => ({ orderId, targetId, removeIds }));
      return (await db.query<{ id: string }>("select apply_paid_roster_changes($1,$2,$3::jsonb,$4::jsonb) id", [course, who, JSON.stringify(s), JSON.stringify(ops)])).rows[0].id;
    };
    const oldId = await insert("old");
    const empty = await snapshot();
    assert.equal(empty.jobId, null);
    const jobId = await apply(empty, [oldId]);
    await db.query(`update job_enrollments set normalized_values=normalized_values || '{"groupChatJoined":true,"memo":"보존할 메모","hasDifferentStudent":true,"studentName":"실제학생","studentPhone":"01055556666","custom":"추가 정보"}',is_extra_participant=true where job_id=$1`, [jobId]);
    await db.query("update course_orders set status='전액환불',refund_amount=120000,current_amount=0 where id=$1", [oldId]);
    const newId = await insert("new");
    // Reproduce the pre-fix duplicate without modifying the old enrollment.
    await db.query("select save_course_paid_roster($1,$2,$3::uuid[])", [course, actor, [newId]]);
    const extraId = await insert("extra", "01077778888");
    // Change the source after the accidental duplicate was created; both rows still refer to the same payer.
    await db.query("update course_orders set option_name='심화반',payment_amount=150000,current_amount=150000,payment_method='계좌이체',payment_id='new-payment',rs='새 RS' where id=$1", [newId]);
    // Keep duplicate at its source values so no manual-edit conflict is manufactured.
    await db.query(`update job_enrollments set normalized_values=normalized_values || '{"optionName":"심화반","paymentAmount":"150000"}' where normalized_values->>'orderRecordKey'='new'`);
    const before = await snapshot();
    assert.equal(before.enrollments.length, 2);
    const original = before.enrollments.find(r => r.normalized_values.orderRecordKey === "old")!;
    const plan = planPaidRoster(before, [newId, extraId]);
    assert.equal(plan.changes.length, 2);
    assert.equal(plan.changes.find(c => c.id === newId)?.kind, "merge");
    await assert.rejects(apply(before, [newId], outsider), /권한/);
    await db.query(`update job_enrollments set normalized_values=normalized_values || '{"memo":"동시 변경"}' where id=$1`, [original.id]);
    await assert.rejects(apply(before, [newId]), /미리보기/);
    assert.equal((await snapshot()).version, before.version);
    await db.query("update job_enrollments set normalized_values=$1::jsonb where id=$2", [JSON.stringify(original.normalized_values), original.id]);
    assert.equal(await apply(await snapshot(), [newId]), jobId); // Extra new student was not selected.
    const after = await snapshot();
    assert.equal(after.enrollments.length, 1);
    const saved = after.enrollments[0];
    assert.deepEqual(saved.normalized_values, { ...original.normalized_values, optionName: "심화반", paymentAmount: "150000.00", orderRecordKey: "new" });
    assert.deepEqual(saved.original_values, { ...original.original_values, "옵션명": "심화반", "결제금액": "150000.00" });
    assert.equal(saved.normalized_phone, original.normalized_phone);
    assert.equal(saved.is_extra_participant, true);
    assert.equal(planPaidRoster(after, [newId]).changes.length, 0);
    assert.equal((await db.query<{ count: number }>("select count(*)::int count from job_enrollments where job_id=$1 and version=$2", [jobId, before.version])).rows[0].count, 2);
    await assert.rejects(apply(before, [newId]), /미리보기/); // Replay is rejected.
    const fresh = await snapshot();
    await db.query("update course_orders set payment_amount=130000 where id=$1", [extraId]);
    await assert.rejects(apply(fresh, [extraId]), /미리보기/);
    await db.exec("set role authenticated");
    await assert.rejects(snapshot(), /permission denied/);
    await assert.rejects(apply(fresh, [extraId]), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});
