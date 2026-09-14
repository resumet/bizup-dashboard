import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const migration = () => readFile("supabase/migrations/202609140008_work_hr_account_sync.sql", "utf8");
async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
  // Upgrade tests deliberately install the deployed seven-migration schema first.
  for (const file of (await readdir("supabase/migrations")).filter(name => /^20260914\d+_hr_/.test(name)).sort()) {
    await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
  }
  const add = async (email: string | null, metadata = {}) => {
    const id = randomUUID();
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)", [id, email, JSON.stringify(metadata)]);
    return id;
  };
  const one = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, unknown>>(sql, params)).rows[0];
  const as = async (id: string) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  };
  const command = async (action: string, body: object) => (await one("select public.hr_command($1,$2::jsonb,$3::uuid) result", [action, JSON.stringify(body), randomUUID()])).result as Record<string, unknown>;
  const query = async (resource: string, filter = {}) => (await one("select public.hr_query($1,$2::jsonb) result", [resource, JSON.stringify(filter)])).result as Record<string, unknown>;
  return { db, add, one, as, command, query };
}

test("WORK sync upgrades existing employees and installs safely before initial HR bootstrap", async () => {
  const { db, add, one } = await fixture();
  try {
    const adminAuth = await add("admin@example.test");
    const staffAuth = await add("Staff@Example.test", { full_name: "직원 이름", department: "운영", role: "admin" });
    await db.exec(await migration());
    assert.equal((await one("select count(*)::int n from hr.employees")).n, 0);
    const lateAuth = await add("late@example.test");
    await db.query("select public.hr_bootstrap($1,'관리자','2020-01-01')", [adminAuth]);
    assert.equal((await one("select count(*)::int n from hr.employees")).n, 3);
    const staff = await one("select * from hr.employees where auth_id=$1", [staffAuth]);
    assert.equal(staff.name, "직원 이름"); assert.equal(staff.department, "운영"); assert.equal(staff.role, "employee");
    assert.equal(staff.email, "staff@example.test");
    await db.query("update hr.employees set active=false,name='수정 이름' where auth_id=$1", [lateAuth]);
    await db.exec(await migration());
    const retained = await one("select * from hr.employees where auth_id=$1", [lateAuth]);
    assert.equal(retained.active, false); assert.equal(retained.name, "수정 이름");
    assert.equal((await one("select count(*)::int n from hr.employees")).n, 3);
    assert.equal((await one("select count(*)::int n from hr.invitations")).n, 0);
    assert.equal((await one("select count(*)::int n from hr.audit where action='employee.created_from_work'")).n, 2);
  } finally { await db.close(); }
});

test("WORK sync backfills, preserves history on deletion and protects account boundaries", async suite => {
  const { db, add, one, as, command, query } = await fixture();
  try {
    const adminAuth = await add("admin@example.test");
    const org = (await one("select public.hr_bootstrap($1,'관리자','2020-01-01') id", [adminAuth])).id;
    const priorAuth = await add("prior@example.test");
    await db.query("insert into hr.employees(organization_id,auth_id,email,name,role,active,employment_start_date) values($1,$2,'prior@example.test','기존 이름','employee',false,'2020-01-01'),($1,null,'collision@example.test','수동 관리자','admin',false,'2020-01-01')", [org, priorAuth]);
    const staffAuth = await add("staff@example.test");
    const restrictedAuth = await add("restricted@example.test", { name: {} });
    await db.query("update auth.users set banned_until=now()+interval '1 day' where id=$1", [restrictedAuth]);
    await add("collision@example.test");
    const anonymousAuth = await add(null);
    await db.exec(await migration());
    const employee = await one("select * from hr.employees where auth_id=$1", [staffAuth]);
    await suite.test("existing account backfill preserves manual settings and skips identity collisions", async () => {
      assert.equal((await one("select * from hr.employees where auth_id=$1", [priorAuth])).active, false);
      assert.equal((await one("select * from hr.employees where auth_id=$1", [priorAuth])).name, "기존 이름");
      assert.equal((await one("select * from hr.employees where auth_id=$1", [restrictedAuth])).active, false);
      assert.equal((await one("select * from hr.employees where email='collision@example.test'")).auth_id, null);
      assert.equal((await one("select count(*)::int n from hr.employees where auth_id=$1", [anonymousAuth])).n, 0);
      await db.query("update auth.users set email='anonymous-now-named@example.test' where id=$1", [anonymousAuth]);
      assert.equal((await one("select count(*)::int n from hr.employees where auth_id=$1", [anonymousAuth])).n, 1);
    });
    await suite.test("new account creates one ordinary employee; login/metadata edits do not reactivate or promote", async () => {
      const id = await add("new@example.test", { full_name: "신규 직원", role: "admin" });
      assert.equal((await one("select * from hr.employees where auth_id=$1", [id])).role, "employee");
      await db.query("update hr.employees set active=false where auth_id=$1", [id]);
      await db.query("update auth.users set raw_user_meta_data='{\"role\":\"admin\"}' where id=$1", [id]);
      await as(id); await assert.rejects(query("context"), /HR 이용 권한/); await db.exec("reset role");
      assert.equal((await one("select * from hr.employees where auth_id=$1", [id])).active, false);
    });
    let task: Record<string, unknown>;
    await suite.test("last admin, unfinished work and open attendance block deletion atomically", async () => {
      await assert.rejects(db.query("delete from auth.users where id=$1", [adminAuth]), /마지막 HR 관리자/);
      await as(staffAuth);
      task = await command("task.create", { title: "보존할 업무", assignee_id: employee.id });
      await db.exec("reset role");
      await assert.rejects(db.query("delete from auth.users where id=$1", [staffAuth]), /미완료/);
      await as(staffAuth);
      await command("task.status", { id: task.id, expected_version: 1, status: "doing" });
      await command("task.status", { id: task.id, expected_version: 2, status: "done" });
      const attendance = await command("attendance.in", {});
      await db.exec("reset role");
      await assert.rejects(db.query("update auth.users set deleted_at=now() where id=$1", [staffAuth]), /출근 기록/);
      assert.equal((await one("select * from hr.employees where id=$1", [employee.id])).active, true);
      await as(staffAuth);
      await command("attendance.out", { id: attendance.id, expected_version: attendance.version });
      await db.exec("reset role");
    });
    await suite.test("WORK foreign key rejection rolls back HR deactivation; successful deletion retains records", async () => {
      await db.exec("create table public.work_owned(id uuid primary key references auth.users(id))");
      await db.query("insert into public.work_owned values($1)", [staffAuth]);
      await assert.rejects(db.query("delete from auth.users where id=$1", [staffAuth]), /foreign key constraint/);
      assert.equal((await one("select * from hr.employees where id=$1", [employee.id])).active, true);
      await db.query("delete from public.work_owned where id=$1", [staffAuth]);
      await db.query("delete from auth.users where id=$1", [staffAuth]);
      const archived = await one("select * from hr.employees where id=$1", [employee.id]);
      assert.equal(archived.active, false); assert.equal(archived.auth_id, null); assert.ok(archived.auth_deleted_at);
      assert.equal((await one("select * from hr.tasks where id=$1", [task.id])).assignee_id, employee.id);
      assert.equal((await one("select count(*)::int n from hr.attendance where employee_id=$1", [employee.id])).n, 1);
      assert.equal((await one("select count(*)::int n from hr.audit where entity_id=$1 and action='employee.deactivated_from_work'", [employee.id])).n, 1);
      const replacement = await add("staff@example.test");
      const newEmployee = await one("select * from hr.employees where auth_id=$1", [replacement]);
      assert.notEqual(newEmployee.id, employee.id); assert.equal(newEmployee.role, "employee");
      await as(replacement);
      await assert.rejects(query("records", { employee_id: employee.id }), /다른 직원/);
      await assert.rejects(query("task", { id: task.id }), /업무를 찾을/);
      await db.exec("reset role");
      await db.query("update auth.users set deleted_at=now(),email='deleted@example.test' where id=$1", [replacement]);
      assert.equal((await one("select * from hr.employees where id=$1", [newEmployee.id])).active, false);
      await db.query("delete from auth.users where id=$1", [replacement]);
      assert.equal((await one("select count(*)::int n from hr.audit where entity_id=$1 and action='employee.deactivated_from_work'", [newEmployee.id])).n, 1);
    });
    await suite.test("HR invitations and automatic auth creation share one employee, including retry and reused email", async () => {
      await as(adminAuth);
      const invitation = await command("invitation.reserve", { email: "invited@example.test", name: "초대 이름", department: "기획", role: "admin", employment_start_date: "2020-01-01" });
      await db.exec("reset role; set role service_role");
      await db.query("select public.hr_claim_invitation($1)", [invitation.id]);
      await db.exec("reset role");
      const invitedAuth = await add("invited@example.test", { role: "employee" });
      const invitedEmployee = await one("select * from hr.employees where auth_id=$1", [invitedAuth]);
      assert.equal(invitedEmployee.name, "초대 이름"); assert.equal(invitedEmployee.role, "admin");
      await db.exec("set role service_role");
      const finished = (await one("select public.hr_finish_invitation($1,$2,true) result", [invitation.id, invitedAuth])).result as Record<string, unknown>;
      assert.equal(finished.id, invitedEmployee.id);
      assert.deepEqual((await one("select public.hr_finish_invitation($1,$2,true) result", [invitation.id, invitedAuth])).result, { status: "sent" });
      await db.exec("reset role");
      await db.query("delete from auth.users where id=$1", [invitedAuth]);
      assert.ok((await one("select * from hr.invitations where id=$1", [invitation.id])).auth_deleted_at);
      await db.exec("set role service_role");
      await assert.rejects(db.query("select public.hr_claim_invitation($1)", [invitation.id]), /삭제된 계정/);
      await assert.rejects(db.query("select public.hr_reconcile_invitation($1)", [invitation.id]), /삭제된 계정/);
      await db.exec("reset role");
      await as(adminAuth);
      const again = await command("invitation.reserve", { email: "invited@example.test", name: "새 직원", department: "운영", role: "employee", employment_start_date: "2020-01-01" });
      assert.notEqual(again.id, invitation.id);
      await db.exec("reset role");
      const newAuth = await add("invited@example.test");
      assert.equal((await one("select * from hr.employees where auth_id=$1", [newAuth])).role, "employee");
      assert.equal((await one("select count(*)::int n from hr.employees where email='invited@example.test'")).n, 2);
    });
    await suite.test("account lifecycle functions stay private", async () => {
      for (const role of ["anon", "authenticated", "service_role"]) {
        await db.exec(`set role ${role}`);
        await assert.rejects(db.query("select hr.sync_all_work_accounts()"), /permission denied/);
        await assert.rejects(db.query("select hr.deactivate_work_account($1)", [adminAuth]), /permission denied/);
        await db.exec("reset role");
      }
    });
  } finally { await db.close(); }
});
