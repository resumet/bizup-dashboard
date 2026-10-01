import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261001030559_link_instagram_materials_to_documents.sql"),
  "utf8",
);

test("인스타 자료는 같은 강의의 글 하나만 연결한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.courses (
      id uuid primary key
    );
    create table public.course_documents (
      id uuid primary key,
      course_id uuid not null references public.courses(id),
      deleted_at timestamptz
    );
    create table public.course_instagram_materials (
      course_id uuid not null references public.courses(id),
      position smallint not null check (position between 1 and 40),
      title text not null default '',
      updated_at timestamptz not null default now(),
      primary key (course_id, position)
    );
  `);
  await db.exec(migration);

  const firstCourseId = "00000000-0000-4000-8000-000000000001";
  const secondCourseId = "00000000-0000-4000-8000-000000000002";
  const documentId = "00000000-0000-4000-8000-000000000003";
  await db.query("insert into public.courses (id) values ($1), ($2)", [firstCourseId, secondCourseId]);
  await db.query("insert into public.course_documents (id, course_id) values ($1, $2)", [documentId, firstCourseId]);
  await db.query(
    "insert into public.course_instagram_materials (course_id, position, document_id) values ($1, 1, $2)",
    [firstCourseId, documentId],
  );

  await assert.rejects(db.query(
    "insert into public.course_instagram_materials (course_id, position, document_id) values ($1, 2, $2)",
    [firstCourseId, documentId],
  ));
  await assert.rejects(db.query(
    "insert into public.course_instagram_materials (course_id, position, document_id) values ($1, 1, $2)",
    [secondCourseId, documentId],
  ));
  await db.query("update public.course_documents set deleted_at = now() where id = $1", [documentId]);

  const saved = await db.query<{ document_id: string | null }>(
    "select document_id from public.course_instagram_materials where course_id = $1 and position = 1",
    [firstCourseId],
  );
  assert.equal(saved.rows[0]?.document_id, null);
  await db.query("delete from public.course_documents where id = $1", [documentId]);
  await db.close();
});
