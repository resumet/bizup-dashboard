import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("WORK account import connects existing identities without mail, duplicates or role changes", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',banned_until timestamptz,deleted_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;`);
    for (const file of (await readdir("supabase/migrations")).filter(name => /^20260914\d+_hr_/.test(name)).sort()) {
      await db.exec(await readFile(`supabase/migrations/${file}`, "utf8"));
    }
    // Substitute only the operator email, so this fixture contains fictitious people exclusively.
    const sql = (await readFile("supabase/hr_import_work_accounts.sql", "utf8")).replaceAll("resumet@gmail.com", "operator@example.test");
    await assert.rejects(db.exec(sql), /초기 HR 관리자/);
    await db.exec("rollback");
    const authIds = Array.from({ length: 6 }, () => randomUUID());
    await db.query("insert into auth.users(id,email) values($1,'operator@example.test')", [authIds[0]]);
    const organization = (await db.query<{ id: string }>("select public.hr_bootstrap($1,'Existing admin','2020-01-01') id", [authIds[0]])).rows[0].id;
    await db.query("insert into auth.users(id,email,raw_user_meta_data) values($1,'Staff@Example.test',$2)", [authIds[1], JSON.stringify({ full_name: "직원 이름", department: "운영", role: "admin" })]);
    await db.query("insert into auth.users(id,email,raw_user_meta_data,banned_until) values($1,'restricted@example.test','{\"name\":{}}',now()+interval '1 day')", [authIds[2]]);
    await db.query("insert into auth.users(id,email) values($1,'existing@example.test'),($2,'collision@example.test'),($3,null)", [authIds[3], authIds[4], authIds[5]]);
    await db.query("insert into hr.employees(organization_id,auth_id,email,name,role,active,employment_start_date) values($1,$2,'existing@example.test','기존 이름','employee',false,'2021-01-01'),($1,null,'collision@example.test','수동 관리자','admin',true,'2020-01-01')", [organization, authIds[3]]);
    await db.exec(sql);
    const rows = (await db.query<{ email: string; auth_id: string | null; role: string; active: boolean; name: string; department: string }>("select * from hr.employees order by email")).rows;
    assert.equal(rows.length, 5);
    const imported = rows.find(row => row.auth_id === authIds[1])!;
    assert.equal(imported.name, "직원 이름"); assert.equal(imported.email, "staff@example.test"); assert.equal(imported.department, "운영");
    assert.equal(imported.role, "employee");
    assert.equal(rows.find(row => row.auth_id === authIds[2])?.active, false);
    assert.equal(rows.find(row => row.auth_id === authIds[2])?.name, "restricted");
    assert.equal(rows.find(row => row.auth_id === authIds[3])?.name, "기존 이름");
    assert.equal(rows.find(row => row.auth_id === authIds[3])?.active, false);
    assert.equal(rows.find(row => row.email === "collision@example.test")?.auth_id, null);
    await db.exec(sql);
    assert.equal((await db.query<{ count: number }>("select count(*)::int from hr.employees")).rows[0].count, 5);
    assert.equal((await db.query<{ count: number }>("select count(*)::int from hr.audit where action='employee.imported_from_work'")).rows[0].count, 2);
    assert.equal((await db.query<{ count: number }>("select count(*)::int from hr.invitations")).rows[0].count, 0);
    assert.equal((await db.query<{ count: number }>("select count(*)::int from auth.users")).rows[0].count, 6);
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [authIds[1]]);
    await db.exec("set role authenticated");
    const context = (await db.query<{ result: { me: { auth_id: string; role: string } } }>("select public.hr_query('context','{}') result")).rows[0].result;
    assert.equal(context.me.auth_id, authIds[1]); assert.equal(context.me.role, "employee");
  } finally { await db.close(); }
});
