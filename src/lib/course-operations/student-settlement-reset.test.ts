import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  studentSettlementResetSchema,
  type StudentSettlementResetResult,
} from "./student-settlement-reset";

test("리셋 요청은 허용한 대상과 명시적인 강의명만 받는다", () => {
  assert.deepEqual(studentSettlementResetSchema.parse({ target: "orders", confirmation: "  테스트 강의  " }), {
    target: "orders", confirmation: "테스트 강의",
  });
  assert.equal(studentSettlementResetSchema.safeParse({ target: "paid-students", confirmation: "테스트 강의" }).success, true);
  for (const value of [
    null, [], {}, { target: "all", confirmation: "테스트 강의" },
    { target: "orders" }, { target: "orders", confirmation: true },
    { target: "orders", confirmation: " " },
    { target: "orders", confirmation: "가".repeat(201) },
    { target: "orders", confirmation: "테스트 강의", courseId: randomUUID() },
  ]) assert.equal(studentSettlementResetSchema.safeParse(value).success, false);
});

test("강의 자료 리셋은 대상만 비우고 이력·다른 강의·비용·정산을 보존하며 권한과 롤백을 적용한다", async (t) => {
  const db = new PGlite();
  const actor = randomUUID(), outsider = randomUUID(), workspace = randomUUID();
  const course = randomUUID(), otherCourse = randomUUID(), emptyCourse = randomUUID();
  const name = "테스트 강의";
  const reset = async (target: string | null, selectedCourse = course, selectedActor = actor, confirmation: string | null = name) => {
    const result = await db.query<{ result: StudentSettlementResetResult }>(
      "select public.reset_course_student_settlement_data($1,$2,$3,$4) result",
      [selectedCourse, selectedActor, target, confirmation],
    );
    return result.rows[0].result;
  };
  const count = async (table: string) => (await db.query<{ count: number }>(`select count(*)::int count from public.${table}`)).rows[0].count;
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;`);
    const archived = "supabase/migrations_archive/20260929";
    const foundation = await readFile(`${archived}/202608260001_foundation.sql`, "utf8");
    await db.exec(foundation.split("create function public.handle_new_user")[0].replace('create extension if not exists "pgcrypto";', ""));
    await db.exec(`create table public.courses(id uuid primary key, workspace_id uuid not null references workspaces,
        name text not null, nova_settled boolean not null default true, instructor_settled boolean not null default true);
      alter table public.course_jobs add column course_id uuid references public.courses on delete set null;
      alter table public.job_enrollments add column is_extra_participant boolean not null default false,
        add column is_manually_added boolean not null default false;
      create table public.course_job_notes(id uuid primary key default gen_random_uuid(),
        course_job_id uuid references public.course_jobs on delete cascade, content text);
      create table public.course_costs(id uuid primary key default gen_random_uuid(), course_id uuid references public.courses, amount numeric);
      create table public.course_settlements(id uuid primary key default gen_random_uuid(), course_id uuid references public.courses, status text);`);
    for (const migration of ["202608260002_roster_messages.sql", "202609120001_course_orders.sql", "202609160002_paid_course_rosters.sql"]) {
      await db.exec(await readFile(`${archived}/${migration}`, "utf8"));
    }
    for (const migration of [
      "20261001155719_course_student_settlement_reset.sql",
      "20261001160101_reserve_paid_roster_reset_version.sql",
    ]) {
      await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8"));
    }
    await db.query("insert into auth.users values($1),($2)", [actor, outsider]);
    await db.query("insert into workspaces(id,name) values($1,'Test')", [workspace]);
    await db.query("insert into workspace_members(workspace_id,user_id) values($1,$2)", [workspace, actor]);
    await db.query("insert into courses(id,workspace_id,name) values($1,$4,$5),($2,$4,'다른 강의'),($3,$4,'빈 강의')", [course, otherCourse, emptyCourse, workspace, name]);
    const addOrder = async (selectedCourse: string) => {
      const importId = (await db.query<{ id: string }>("insert into course_order_imports(course_id,file_name,row_count) values($1,'orders.xlsx',1) returning id", [selectedCourse])).rows[0].id;
      return (await db.query<{ id: string }>(`insert into course_orders(course_id,record_key,product_name,member_name,phone,
        payment_amount,refund_amount,current_amount,status,import_id) values($1,$2,'강의','학생','01012345678',100000,0,100000,'결제완료',$3) returning id`,
      [selectedCourse, randomUUID(), importId])).rows[0].id;
    };
    const firstOrder = await addOrder(course);
    await addOrder(course);
    const otherOrder = await addOrder(otherCourse);
    const createRoster = async (selectedCourse: string, orderId: string) => (await db.query<{ id: string }>(
      "select save_course_paid_roster($1,$2,$3::uuid[]) id", [selectedCourse, actor, [orderId]],
    )).rows[0].id;
    const job = await createRoster(course, firstOrder);
    const otherJob = await createRoster(otherCourse, otherOrder);
    const enrollment = (await db.query<{ id: string }>("select id from job_enrollments where job_id=$1 and version=1", [job])).rows[0].id;
    await db.query("insert into course_jobs(workspace_id,course_id,name,created_by) values($1,$2,'일반 명단',$3),($1,null,'미연결 명단',$3)", [workspace, course, actor]);
    await db.query(`insert into job_enrollments(job_id,version,source_row_number,normalized_values,is_manually_added)
      values($1,1,3,'{"customerName":"수동 학생"}',true),($1,1,4,'{"refundedAt":"2026-09-01"}',false),
      ($1,4,2,'{"customerName":"미완료 이전 버전"}',false)`, [job]);
    await db.query("update course_jobs set valid_count=3 where id=$1", [job]);
    await db.query(`insert into job_file_versions(job_id,version,storage_path,original_filename,checksum_sha256,file_size,uploaded_by)
      values($1,6,'historical.xlsx','historical.xlsx','historical',100,$2)`, [job, actor]);
    await db.query("insert into course_job_notes(course_job_id,content) values($1,'보존할 메모')", [job]);
    const message = (await db.query<{ id: string }>(`insert into message_jobs(workspace_id,course_job_id,job_version,template_key,template_code,target_scope,idempotency_key,requested_by)
      values($1,$2,1,'paid_confirm','template','all','history',$3) returning id`, [workspace, job, actor])).rows[0].id;
    await db.query("insert into message_recipients(message_job_id,enrollment_id,normalized_phone,status) values($1,$2,'01012345678','success')", [message, enrollment]);
    await db.query("insert into course_costs(course_id,amount) values($1,50000)", [course]);
    await db.query("insert into course_settlements(course_id,status) values($1,'confirmed')", [course]);

    await assert.rejects(reset("all"), /항목/);
    await assert.rejects(reset(null), /항목/);
    await assert.rejects(reset("orders", course, actor, null), /강의명/);
    await assert.rejects(reset("orders", course, actor, "가".repeat(201)), /강의명/);
    await assert.rejects(reset("orders", course, actor, "다른 강의"), /강의명이 일치/);
    await assert.rejects(reset("orders", course, outsider), /권한/);
    await assert.rejects(reset("paid-students", course, outsider), /권한/);
    await assert.rejects(reset("orders", randomUUID()), /찾을 수/);
    assert.equal(await count("course_orders"), 3);

    assert.deepEqual(await reset("orders", course, actor, `  ${name}  `), {
      target: "orders", resetCount: 2, jobId: null, previousVersion: null, version: null,
    });
    assert.equal(await count("course_orders"), 1);
    assert.equal(await count("course_order_imports"), 3);
    assert.equal((await db.query("select id from course_orders where course_id=$1", [otherCourse])).rows.length, 1);
    assert.equal((await db.query("select id from job_enrollments where job_id=$1 and version=1", [job])).rows.length, 3);

    const beforeHistory = await db.query("select * from job_enrollments order by id");
    assert.deepEqual(await reset("paid-students"), {
      target: "paid-students", resetCount: 3, jobId: job, previousVersion: 1, version: 8,
    });
    assert.deepEqual((await db.query("select * from job_enrollments order by id")).rows, beforeHistory.rows);
    assert.deepEqual((await db.query("select latest_version,valid_count,error_count,status from course_jobs where id=$1", [job])).rows[0], {
      latest_version: 8, valid_count: 0, error_count: 0, status: "ready",
    });
    assert.equal((await db.query("select id from job_enrollments where job_id=$1 and version=8", [job])).rows.length, 0);
    assert.equal((await db.query<{ latest_version: number }>("select latest_version from course_jobs where id=$1", [otherJob])).rows[0].latest_version, 1);
    for (const table of ["job_file_versions", "course_job_notes", "message_jobs", "message_recipients", "course_costs", "course_settlements"]) {
      assert.equal(await count(table), 1, `${table} is preserved`);
    }
    assert.equal(await count("course_jobs"), 4);
    assert.equal((await db.query("select id from courses where nova_settled and instructor_settled")).rows.length, 3);
    assert.equal((await db.query("select id from audit_logs where event_type='course_operations.data_reset'")).rows.length, 2);
    assert.equal((await reset("orders")).resetCount, 0);
    assert.equal((await reset("paid-students")).resetCount, 0);
    assert.deepEqual(await reset("paid-students", emptyCourse, actor, "빈 강의"), {
      target: "paid-students", resetCount: 0, jobId: null, previousVersion: null, version: null,
    });
    assert.equal(await count("course_jobs"), 4);

    await t.test("리셋 직전 버전을 읽은 작업의 N+1 삽입·CAS 실패·정리가 새 명단을 침범하지 않는다", async () => {
      const staleVersion = (await db.query<{ latest_version: number }>(
        "select latest_version from course_jobs where id=$1", [otherJob],
      )).rows[0].latest_version;
      const result = await reset("paid-students", otherCourse, actor, "다른 강의");
      assert.equal(result.previousVersion, staleVersion);
      assert.equal(result.version, staleVersion + 2);
      const currentVersion = result.version!;
      const currentStudent = (await db.query<{ id: string }>(`insert into job_enrollments(
        job_id,version,source_row_number,normalized_values,is_manually_added)
        values($1,$2,2,'{"customerName":"리셋 후 추가한 학생"}',true) returning id`,
      [otherJob, currentVersion])).rows[0].id;
      await db.query("update course_jobs set valid_count=1 where id=$1 and latest_version=$2", [otherJob, currentVersion]);

      // Match the legacy writer's statement sequence after it resumes with N.
      await db.query(`insert into job_enrollments(job_id,version,source_row_number,normalized_values)
        values($1,$2,2,'{"customerName":"리셋 전 명단의 지연 저장"}')`, [otherJob, staleVersion + 1]);
      const staleUpdate = await db.query("update course_jobs set latest_version=$2,valid_count=1 where id=$1 and latest_version=$3 returning id",
        [otherJob, staleVersion + 1, staleVersion]);
      assert.equal(staleUpdate.rows.length, 0);
      await db.query("delete from job_enrollments where job_id=$1 and version=$2", [otherJob, staleVersion + 1]);

      assert.deepEqual((await db.query(`select e.id from job_enrollments e
        join course_jobs j on j.id=e.job_id and j.latest_version=e.version
        where j.id=$1`, [otherJob])).rows, [{ id: currentStudent }]);
      assert.equal((await db.query("select id from job_enrollments where job_id=$1 and version=$2", [otherJob, staleVersion])).rows.length, 1);
      assert.deepEqual((await db.query("select latest_version,valid_count from course_jobs where id=$1", [otherJob])).rows[0], {
        latest_version: currentVersion, valid_count: 1,
      });
    });

    // Recreating a paid roster uses its existing job and starts from the empty
    // current version, so old students do not silently return.
    const newOrder = await addOrder(course);
    assert.equal(await createRoster(course, newOrder), job);
    const activeRows = await db.query(`select e.id from job_enrollments e join course_jobs j on j.id=e.job_id and j.latest_version=e.version where j.id=$1`, [job]);
    assert.equal(activeRows.rows.length, 1);
    const beforeRollback = await db.query("select * from course_jobs where id=$1", [job]);
    await db.exec(`create function fail_reset_audit() returns trigger language plpgsql as $$ begin
      if new.event_type='course_operations.data_reset' then raise exception 'audit failed'; end if; return new;
      end $$; create trigger fail_reset_audit before insert on audit_logs for each row execute function fail_reset_audit();`);
    await assert.rejects(reset("orders"), /audit failed/);
    assert.equal((await db.query("select id from course_orders where course_id=$1", [course])).rows.length, 1);
    await assert.rejects(reset("paid-students"), /audit failed/);
    assert.deepEqual((await db.query("select * from course_jobs where id=$1", [job])).rows, beforeRollback.rows);
    await db.exec("drop trigger fail_reset_audit on audit_logs;");
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`set role ${role}`);
      await assert.rejects(reset("orders"), /permission denied/);
      await db.exec("reset role");
    }
    await db.exec("set role service_role");
    assert.equal((await reset("orders")).resetCount, 1);
    await db.exec("reset role");
  } finally {
    await db.close();
  }
});
