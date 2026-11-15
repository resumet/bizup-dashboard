import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

test("강의별 명단은 원자적으로 저장하고 중복·잘못된 형식·직접 접근을 차단한다", async () => {
  const db = new PGlite();
  const courseId = "00000000-0000-4000-8000-000000000001";
  try {
    await db.exec(`create role authenticated; create role anon; create role service_role;
      create schema auth; create table auth.users(id uuid primary key);
      create table public.courses(id uuid primary key);
      insert into public.courses values ('${courseId}');`);
    await db.exec(await readFile("supabase/migrations/20261115174241_add_course_free_students.sql", "utf8"));
    await db.exec("set role service_role");
    await db.query("insert into public.course_free_students(course_id,source_url,rows) values ($1,$2,$3)", [courseId, "https://example.test", JSON.stringify([{ username: "테스트", isNewUser: false }])]);
    await assert.rejects(db.query("insert into public.course_free_students(course_id,source_url) values ($1,'x')", [courseId]), /duplicate/);
    await assert.rejects(db.query("update public.course_free_students set rows='{}' where course_id=$1", [courseId]), /check constraint/);
    const before = await db.query<{ rows: unknown; updated_at: string }>("select rows,updated_at from public.course_free_students where course_id=$1", [courseId]);
    assert.deepEqual(before.rows[0].rows, [{ username: "테스트", isNewUser: false }]);
    const stale = await db.query("update public.course_free_students set rows='[]' where course_id=$1 and updated_at='2000-01-01' returning course_id", [courseId]);
    assert.equal(stale.rows.length, 0);
    for (const role of ["anon", "authenticated"]) {
      await db.exec(`reset role; set role ${role}`);
      await assert.rejects(db.query("select * from public.course_free_students"), /permission denied/);
    }
    await db.exec(`reset role; delete from public.courses where id='${courseId}'`);
    assert.equal((await db.query("select * from public.course_free_students")).rows.length, 0);
  } finally { await db.close(); }
});
