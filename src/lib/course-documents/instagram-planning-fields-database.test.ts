import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261001083952_add_instagram_planning_fields.sql"),
  "utf8",
);

test("기획시트 URL과 두 자리 참고기획번호를 DB에서 검증해 저장한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create table public.courses (
      id uuid primary key
    );
    create table public.course_document_settings (
      course_id uuid primary key references public.courses(id),
      workspace_id uuid not null
    );
    create table public.course_instagram_materials (
      course_id uuid not null references public.courses(id),
      position smallint not null,
      title text not null default '',
      primary key (course_id, position)
    );
  `);
  await db.exec(migration);

  const courseId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into public.courses (id) values ($1)", [courseId]);
  await db.query(
    "insert into public.course_document_settings (course_id, workspace_id, planning_sheet_url) values ($1, $2, $3)",
    [courseId, workspaceId, "https://docs.google.com/spreadsheets/d/example"],
  );
  await db.query(
    "insert into public.course_instagram_materials (course_id, position, reference_planning_number) values ($1, 1, '07')",
    [courseId],
  );

  const settings = await db.query<{ planning_sheet_url: string }>(
    "select planning_sheet_url from public.course_document_settings where course_id = $1",
    [courseId],
  );
  const materials = await db.query<{ reference_planning_number: string }>(
    "select reference_planning_number from public.course_instagram_materials where course_id = $1 and position = 1",
    [courseId],
  );
  assert.equal(settings.rows[0]?.planning_sheet_url, "https://docs.google.com/spreadsheets/d/example");
  assert.equal(materials.rows[0]?.reference_planning_number, "07");

  await assert.rejects(db.query(
    "update public.course_instagram_materials set reference_planning_number = '7' where course_id = $1",
    [courseId],
  ));
  await assert.rejects(db.query(
    "update public.course_document_settings set planning_sheet_url = 'javascript:alert(1)' where course_id = $1",
    [courseId],
  ));

  await db.close();
});
