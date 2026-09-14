import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

async function main() {
  const generated = await readFile("tmp/hr-install.sql", "utf8");
  // Exercise the generated SQL with an isolated fictitious authentication account.
  const configuredEmail = /WHERE lower\(email\)='(?:''|[^'])*';/g;
  assert.equal([...generated.matchAll(configuredEmail)].length, 1);
  const sql = generated.replace(configuredEmail, "WHERE lower(email)='hr-install@example.test';");
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key,email text);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      insert into auth.users values(gen_random_uuid(),'staff@example.test');`);
    // A failure after all migrations must still roll back the entire installation.
    await assert.rejects(db.exec(sql), /must have an existing authentication account/);
    await db.exec("rollback");
    assert.equal((await db.query<{ schema: string | null }>("select to_regnamespace('hr')::text schema")).rows[0].schema, null);
    await db.exec("insert into auth.users values(gen_random_uuid(),'hr-install@example.test')");
    await db.exec(sql);
    assert.equal((await db.query<{ count: number }>("select count(*)::int from hr.employees where role='admin' and active")).rows[0].count, 1);
    await assert.rejects(db.exec(sql), /HR schema already exists/);
    await db.exec("rollback");
    assert.equal((await db.query<{ count: number }>("select count(*)::int from hr.employees")).rows[0].count, 2);
    console.log("Generated installation SQL imports WORK staff, creates one admin, rolls back failed setup, and safely rejects repeated installation.");
  } finally { await db.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
