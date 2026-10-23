import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261023054333_expand_instagram_progress_management.sql"),
  "utf8",
);

test("인스타 진행 건수에 맞춰 행을 만들고 완료 단계와 축소를 안전하게 검증한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.courses (
      id uuid primary key,
      workspace_id uuid not null,
      instructor_name text not null default ''
    );
    create table public.course_document_settings (
      course_id uuid primary key references public.courses(id),
      workspace_id uuid not null,
      updated_at timestamptz not null default now()
    );
    create table public.course_documents (
      id uuid primary key default gen_random_uuid(),
      workspace_id uuid not null,
      course_id uuid not null references public.courses(id),
      instructor_name text not null default '',
      title text not null,
      slug text not null unique,
      content jsonb not null default '[]'::jsonb,
      created_at timestamptz not null default now(),
      updated_at timestamptz not null default now(),
      deleted_at timestamptz
    );
    create table public.course_instagram_materials (
      course_id uuid not null references public.courses(id),
      position smallint not null,
      title text not null default '',
      reference_planning_number text not null default '',
      document_id uuid references public.course_documents(id),
      updated_at timestamptz not null default now(),
      constraint course_instagram_materials_position_check check (position between 1 and 40),
      primary key (course_id, position)
    );
  `);

  const courseId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into public.courses (id, workspace_id, instructor_name) values ($1, $2, '강사')", [courseId, workspaceId]);
  await db.query("insert into public.course_document_settings (course_id, workspace_id) values ($1, $2)", [courseId, workspaceId]);
  await db.query("insert into public.course_instagram_materials (course_id, position, title) values ($1, 1, '기존 자료')", [courseId]);

  await db.exec(migration);

  await db.query(
    "select public.resize_instagram_progress($1, $2, $3, 3::smallint, 2::smallint, 1::smallint)",
    [courseId, workspaceId, "https://www.instagram.com/example"],
  );

  const settings = await db.query<{ instagram_account_url: string; instagram_total_count: number }>(
    "select instagram_account_url, instagram_total_count from public.course_document_settings where course_id = $1",
    [courseId],
  );
  assert.deepEqual(settings.rows[0], {
    instagram_account_url: "https://www.instagram.com/example",
    instagram_total_count: 3,
  });

  const materials = await db.query<{ position: number; planning_completed: boolean; filming_completed: boolean }>(
    "select position, planning_completed, filming_completed from public.course_instagram_materials where course_id = $1 order by position",
    [courseId],
  );
  assert.deepEqual(materials.rows, [
    { position: 1, planning_completed: true, filming_completed: true },
    { position: 2, planning_completed: true, filming_completed: false },
    { position: 3, planning_completed: false, filming_completed: false },
  ]);

  await assert.rejects(db.query(
    "update public.course_instagram_materials set upload_completed = true where course_id = $1 and position = 3",
    [courseId],
  ));

  await db.query("update public.course_instagram_materials set dm_material = '보존할 자료' where course_id = $1 and position = 3", [courseId]);
  await assert.rejects(db.query(
    "select public.resize_instagram_progress($1, $2, '', 2::smallint, 2::smallint, 1::smallint)",
    [courseId, workspaceId],
  ));

  await db.close();
});
