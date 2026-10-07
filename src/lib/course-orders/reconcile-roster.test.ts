import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  planAutomaticPaidRosterSync,
  planPaidRoster,
  type ReconcileOrder,
  type ReconcileEnrollment,
  type RosterSnapshot,
} from "./reconcile-roster";

const order = (id: string, extra: Partial<ReconcileOrder> = {}): ReconcileOrder => ({
  id, record_key: id, member_name: "검증학생", phone: "01012345678", email: "test@example.test",
  status: "결제완료", current_amount: 120000, refund_amount: 0, payment_amount: 120000, option_name: "기본반",
  payment_date: "2026-09-21", ...extra,
});
const enrollment = (id: string, values: Record<string, unknown> = {}): ReconcileEnrollment => ({
  id, source_row_number: 2, normalized_phone: "01012345678", student_id: null, is_extra_participant: false, is_manually_added: false,
  original_values: {}, normalized_values: { customerName: "검증학생", phone: "01012345678", email: "test@example.test", optionName: "기본반", paymentAmount: "120000", orderRecordKey: id, ...values },
});
const state = (orders: ReconcileOrder[], enrollments: ReconcileEnrollment[]): RosterSnapshot => ({ courseName: "강의", webinarDate: "2026-09-20", jobId: "job", version: 1, orders, enrollments });
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
  ]) {
    const plan = planPaidRoster(snapshot, ["new"]);
    assert.equal(plan.changes.length, 0);
    assert.equal(plan.conflicts.length, 1);
  }
});

test("부분환불 후 재결제는 기존 수강생에 연결하고 입금대기는 명단에 추가하지 않는다", () => {
  const partial = order("old", { status: "부분환불", current_amount: 100000, refund_amount: 20000 });
  const repaid = planPaidRoster(state([partial, order("new")], [enrollment("old")]), ["new"]).changes[0];
  assert.equal(repaid.kind, "update");
  assert.equal(repaid.targetId, "old");
  assert.equal(repaid.orderId, "new");
  assert.equal(planPaidRoster(state([order("pending", { status: "입금대기" })], []), ["pending"]).changes.length, 0);
});

test("웨비나보다 이른 결제는 신규 결제자에서 제외하고 기존 결제자도 제외 대상으로 만든다", () => {
  const before = order("before", { payment_date: "2026-09-19" });
  const sameDay = order("same-day", { payment_date: "2026-09-20", phone: "01099998888" });
  const snapshot = state([before, sameDay], [enrollment("before")]);
  const manual = planPaidRoster(snapshot, [before.id, sameDay.id]);
  assert.equal(manual.changes.some((change) => change.kind === "add" && change.orderId === before.id), false);
  assert.equal(manual.changes.some((change) => change.kind === "add" && change.orderId === sameDay.id), true);
  const removal = manual.changes.find((change) => change.kind === "remove");
  assert.equal(removal?.targetId, "before");
  assert.match(removal?.reason ?? "", /웨비나일/);
  const automatic = planAutomaticPaidRosterSync(snapshot);
  assert.equal(automatic.beforeWebinarExcludedCount, 1);
  assert.equal(automatic.changes.some((change) => change.kind === "remove"), true);
});

test("전액환불·부분환불·취소·누락 주문은 제외 후보로 표시하고 수동·이미 환불자는 유지한다", () => {
  for (const status of ["전액환불", "주문취소"]) {
    const s = state([order("old", { status, current_amount: 0 })], [enrollment("old")]);
    const before = structuredClone(s);
    const changes = planPaidRoster(s, []).changes;
    assert.equal(changes.length, 1);
    assert.equal(changes[0].kind, "remove");
    assert.equal(changes[0].targetId, "old");
    assert.deepEqual(s, before);
  }
  const missing = planPaidRoster(state([], [enrollment("old")]), []).changes[0];
  assert.equal(missing.kind, "remove");
  assert.equal(missing.orderId, null);
  assert.match(missing.reason, /없어졌습니다/);
  const partialRemoval = planPaidRoster(
    state([order("old", { status: "부분환불", current_amount: 10000, refund_amount: 110000 })], [enrollment("old")]),
    [],
  ).changes;
  assert.equal(partialRemoval.length, 1);
  assert.equal(partialRemoval[0].kind, "remove");
  assert.equal(partialRemoval[0].exclusionReason, "partial_refund");
  assert.match(partialRemoval[0].reason, /부분환불/);
  assert.equal(planPaidRoster(state([order("old")], [enrollment("old")]), []).changes.length, 0); // Omitted selection is not an absent order.
  for (const row of [enrollment("old", { refundedAt: "2026-09-18" }), enrollment("old", { orderRecordKey: "" }), { ...enrollment("old"), is_manually_added: true }]) {
    assert.equal(planPaidRoster(state([], [row]), []).changes.length, 0);
  }
  assert.equal(planPaidRoster(state([refund, order("new")], [enrollment("old")]), []).changes.length, 0); // Repurchase not selected: retain old entry.
  assert.equal(planPaidRoster(state([order("old", { status: "주문취소", current_amount: 0 }), order("new")], [enrollment("old")]), ["new"]).changes[0].kind, "update");
});

test("주문 갱신 자동 동기화는 명시적 환불만 제외하고 재결제자는 복원하며 신규·누락 주문은 자동 처리하지 않는다", () => {
  const cancelled = planAutomaticPaidRosterSync(
    state([refund], [enrollment("old")]),
  );
  assert.equal(cancelled.changes.length, 1);
  assert.equal(cancelled.changes[0].kind, "remove");

  const partial = planAutomaticPaidRosterSync(
    state(
      [order("old", { status: "부분환불", current_amount: 10000, refund_amount: 110000 })],
      [enrollment("old")],
    ),
  );
  assert.equal(partial.changes.length, 1);
  assert.equal(partial.changes[0].kind, "remove");
  assert.equal(partial.reviewRequiredCount, 0);

  const archived = enrollment("old", {
    refundedAt: "2026-09-15T00:00:00Z",
    refundedBy: "actor",
    refundSource: "order_roster_review",
    memo: "참여 이력 보존",
  });
  const repaid = planAutomaticPaidRosterSync(
    state([refund, order("new", { payment_amount: 150000 })], [archived]),
  );
  assert.equal(repaid.changes.length, 1);
  assert.equal(repaid.changes[0].kind, "update");
  assert.equal(repaid.changes[0].targetId, "old");
  assert.equal(repaid.changes[0].orderId, "new");
  assert.equal(repaid.reviewRequiredCount, 0);

  const repaidWithoutOldOrder = planAutomaticPaidRosterSync(
    state([order("new")], [archived]),
  );
  assert.equal(repaidWithoutOldOrder.changes.length, 1);
  assert.equal(repaidWithoutOldOrder.changes[0].kind, "update");
  assert.equal(repaidWithoutOldOrder.reviewRequiredCount, 0);

  const missing = planAutomaticPaidRosterSync(state([], [enrollment("old")]));
  assert.equal(missing.changes.length, 0);
  assert.equal(missing.reviewRequiredCount, 1);

  const newPayer = planAutomaticPaidRosterSync(state([order("new")], []));
  assert.equal(newPayer.changes.length, 0);
  assert.equal(newPayer.reviewRequiredCount, 0);

  const ambiguousRepurchase = planAutomaticPaidRosterSync(
    state([refund, order("new"), order("another")], [enrollment("old")]),
  );
  assert.equal(ambiguousRepurchase.changes.length, 0);
  assert.equal(ambiguousRepurchase.reviewRequiredCount, 2);
});

test("선택 반영은 가격·옵션만 수정하고 개인 정보 보존, 중복 정리, 이력, 동시 수정 검증을 원자적으로 수행한다", async () => {
  const db = new PGlite();
  const actor = randomUUID(), outsider = randomUUID(), workspace = randomUUID(), course = randomUUID();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;`);
    const foundation = await readFile("supabase/migrations_archive/20260929/202608260001_foundation.sql", "utf8");
    await db.exec(foundation.split("create function public.handle_new_user")[0].replace('create extension if not exists "pgcrypto";', ""));
    await db.exec(`create table public.courses(id uuid primary key, workspace_id uuid not null references workspaces, name text not null, free_webinar_at timestamptz not null);
      alter table public.course_jobs add column course_id uuid references public.courses on delete set null;
      alter table public.job_enrollments add column is_extra_participant boolean not null default false, add column is_manually_added boolean not null default false;
      create unique index on public.job_enrollments(job_id,version,source_row_number);`);
    for (const name of ["202609120001_course_orders", "202609160002_paid_course_rosters", "202609160005_paid_roster_reconciliation", "202609180001_paid_roster_removal_review"]) {
      await db.exec(await readFile(`supabase/migrations_archive/20260929/${name}.sql`, "utf8"));
    }
    await db.exec(
      await readFile(
        "supabase/migrations/20261006071251_reactivate_repaid_course_students.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261006072837_store_course_order_payment_date.sql",
        "utf8",
      ),
    );
    await db.exec(
      await readFile(
        "supabase/migrations/20261006083601_exclude_partial_refunds_from_paid_roster.sql",
        "utf8",
      ),
    );
    await db.query("insert into auth.users values($1),($2)", [actor, outsider]);
    await db.query("insert into workspaces(id,name) values($1,'Test')", [workspace]);
    await db.query("insert into workspace_members(workspace_id,user_id) values($1,$2)", [workspace, actor]);
    await db.query("insert into courses values($1,$2,'검증 강의','2026-09-20 19:00:00+09')", [course, workspace]);
    const importId = (await db.query<{ id: string }>("insert into course_order_imports(course_id,file_name,row_count) values($1,'test.xlsx',3) returning id", [course])).rows[0].id;
    const insert = async (key: string, phone = "01012345678", paymentDate = "2026-09-21") => (await db.query<{ id: string }>(`insert into course_orders(course_id,record_key,product_name,option_name,member_name,phone,email,payment_amount,refund_amount,current_amount,status,payment_method,rs,payment_id,payment_date,import_id)
      values($1,$2,'강의','기본반','검증학생',$3,'test@example.test',120000,0,120000,'결제완료','카드','기존 RS','old-payment',$4,$5) returning id`, [course, key, phone, paymentDate, importId])).rows[0].id;
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
    const review = async (s: RosterSnapshot, changes: unknown[], who = actor) => db.query(
      "select apply_paid_roster_review($1,$2,$3::jsonb,$4::jsonb)", [course, who, JSON.stringify(s), JSON.stringify(changes)],
    );
    await db.query("update course_orders set status='주문취소',current_amount=0 where id=$1", [newId]);
    const removalPreview = await snapshot();
    const proposed = planPaidRoster(removalPreview, [extraId]).changes;
    const removal = proposed.find(c => c.kind === "remove")!;
    assert.ok(removal);
    const addition = proposed.find(c => c.kind === "add")!;
    await assert.rejects(review(removalPreview, [removal], outsider), /권한/);
    await assert.rejects(review(removalPreview, [removal, { ...addition, orderId: randomUUID() }]), /주문/);
    assert.deepEqual(await snapshot(), removalPreview); // Entire transaction rolls back, including exclusion.
    await review(removalPreview, [addition]); // Unapproved exclusion remains active.
    const afterAddition = await snapshot();
    const retained = afterAddition.enrollments.find(r => r.normalized_values.orderRecordKey === "new")!;
    assert.equal(retained.normalized_values.refundedAt, undefined);
    await assert.rejects(review(removalPreview, [removal]), /미리보기/);
    const approved = planPaidRoster(afterAddition, []).changes.filter(c => c.kind === "remove");
    assert.equal(approved.length, 1);
    await review(afterAddition, approved); // Exclusion-only update, no paid orders selected.
    const afterRemoval = await snapshot();
    const archived = afterRemoval.enrollments.find(r => r.id === retained.id)!;
    assert.ok(archived.normalized_values.refundedAt);
    assert.equal(archived.normalized_values.refundedBy, actor);
    const { refundedAt, refundedBy, refundSource, ...preserved } = archived.normalized_values;
    assert.ok(refundedAt && refundedBy && refundSource);
    assert.deepEqual(preserved, retained.normalized_values);
    assert.deepEqual(archived.original_values, retained.original_values);
    assert.equal(planPaidRoster(afterRemoval, []).changes.length, 0);
    const repaidId = await insert("repaid");
    const reactivationSnapshot = await snapshot();
    const reactivation = planAutomaticPaidRosterSync(reactivationSnapshot);
    assert.equal(reactivation.changes.length, 1);
    assert.equal(reactivation.changes[0].kind, "update");
    assert.equal(reactivation.changes[0].targetId, archived.id);
    await apply(reactivationSnapshot, [repaidId]);
    const reactivated = (await snapshot()).enrollments.find(
      (row) => row.normalized_values.orderRecordKey === "repaid",
    )!;
    assert.equal(reactivated.normalized_values.refundedAt, undefined);
    assert.equal(reactivated.normalized_values.refundedBy, undefined);
    assert.equal(reactivated.normalized_values.refundSource, undefined);
    assert.equal(reactivated.normalized_values.memo, "보존할 메모");
    assert.equal(reactivated.normalized_values.groupChatJoined, true);
    await db.query("update course_orders set status='전액환불',current_amount=0 where id=$1", [extraId]);
    const nextId = await insert("next", "01099990000");
    const mixedSnapshot = await snapshot();
    const mixed = planPaidRoster(mixedSnapshot, [nextId]).changes;
    assert.equal(mixed.filter(c => c.kind === "add").length, 1);
    assert.equal(mixed.filter(c => c.kind === "remove").length, 1);
    await review(mixedSnapshot, mixed);
    const mixedResult = await snapshot();
    assert.ok(mixedResult.enrollments.find(r => r.normalized_values.orderRecordKey === "extra")?.normalized_values.refundedAt);
    assert.equal(mixedResult.enrollments.find(r => r.normalized_values.orderRecordKey === "repaid")?.normalized_values.refundedAt, undefined);
    assert.equal(mixedResult.enrollments.find(r => r.normalized_values.orderRecordKey === "next")?.normalized_values.refundedAt, undefined);
    assert.equal(mixedResult.enrollments.length, 3);
    const beforeWebinarId = await insert("before-webinar", "01033334444", "2026-09-20");
    await apply(await snapshot(), [beforeWebinarId]);
    await db.query("update course_orders set payment_date='2026-09-19' where id=$1", [beforeWebinarId]);
    const beforeWebinarSnapshot = await snapshot();
    const beforeWebinarRemoval = planPaidRoster(beforeWebinarSnapshot, []).changes.find(
      (change) => change.kind === "remove" && change.orderId === beforeWebinarId,
    )!;
    assert.ok(beforeWebinarRemoval);
    await review(beforeWebinarSnapshot, [beforeWebinarRemoval]);
    const beforeWebinarArchived = (await snapshot()).enrollments.find(
      (item) => item.normalized_values.orderRecordKey === "before-webinar",
    )!;
    assert.equal(beforeWebinarArchived.normalized_values.refundSource, "before_webinar_payment");
    const partialRefundId = await insert("partial-refund", "01044445555");
    await apply(await snapshot(), [partialRefundId]);
    await db.query(
      "update course_orders set status='부분환불',refund_amount=20000,current_amount=100000 where id=$1",
      [partialRefundId],
    );
    const partialRefundSnapshot = await snapshot();
    const partialRefundRemoval = planPaidRoster(partialRefundSnapshot, []).changes.find(
      (change) => change.kind === "remove" && change.orderId === partialRefundId,
    )!;
    assert.ok(partialRefundRemoval);
    await review(partialRefundSnapshot, [partialRefundRemoval]);
    const partialRefundArchived = (await snapshot()).enrollments.find(
      (item) => item.normalized_values.orderRecordKey === "partial-refund",
    )!;
    assert.equal(partialRefundArchived.normalized_values.refundSource, "partial_refund");
    await db.exec("set role authenticated");
    await assert.rejects(snapshot(), /permission denied/);
    await assert.rejects(apply(fresh, [extraId]), /permission denied/);
    await assert.rejects(review(afterRemoval, approved), /permission denied/);
    await db.exec("reset role");
  } finally { await db.close(); }
});
