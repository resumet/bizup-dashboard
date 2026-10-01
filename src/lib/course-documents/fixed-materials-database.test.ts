import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const linkMigration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261001030559_link_instagram_materials_to_documents.sql"),
  "utf8",
);
const fixedMaterialMigration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261001051640_fixed_instagram_material_documents.sql"),
  "utf8",
);

test("고정 인스타 자료는 기존 글을 보존하고 같은 항목의 글을 한 번만 만든다", async () => {
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
      position smallint not null check (position between 1 and 40),
      title text not null default '',
      notion_url text not null default '',
      updated_at timestamptz not null default now(),
      primary key (course_id, position)
    );
  `);
  await db.exec(linkMigration);

  const courseId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  const matchingDocumentId = "00000000-0000-4000-8000-000000000003";
  const remainingDocumentId = "00000000-0000-4000-8000-000000000004";
  await db.query(
    "insert into public.courses (id, workspace_id, instructor_name) values ($1, $2, '강사')",
    [courseId, workspaceId],
  );
  await db.query(
    `insert into public.course_documents (id, workspace_id, course_id, title, slug, created_at)
     values ($1, $2, $3, '첫 번째 제목', 'legacy-first', '2026-01-01'),
            ($4, $2, $3, '두 번째 제목', 'legacy-second', '2026-01-02')`,
    [matchingDocumentId, workspaceId, courseId, remainingDocumentId],
  );
  await db.query(
    "insert into public.course_instagram_materials (course_id, position, title) values ($1, 1, '첫 번째 제목'), ($1, 2, '')",
    [courseId],
  );

  await db.exec(fixedMaterialMigration);

  const backfilled = await db.query<{ position: number; title: string; document_id: string | null }>(
    "select position, title, document_id from public.course_instagram_materials where course_id = $1 order by position",
    [courseId],
  );
  assert.deepEqual(backfilled.rows, [
    { position: 1, title: "첫 번째 제목", document_id: matchingDocumentId },
    { position: 2, title: "두 번째 제목", document_id: remainingDocumentId },
  ]);

  await db.query(
    "update public.course_instagram_materials set title = '수정된 제목' where course_id = $1 and position = 1",
    [courseId],
  );
  const renamed = await db.query<{ title: string }>(
    "select title from public.course_documents where id = $1",
    [matchingDocumentId],
  );
  assert.equal(renamed.rows[0]?.title, "수정된 제목");

  await db.query(
    "insert into public.course_instagram_materials (course_id, position, title) values ($1, 3, '새 제목')",
    [courseId],
  );
  const created = await db.query<{ id: string }>(
    "select public.start_instagram_material_document($1, 3::smallint, 'new-document') as id",
    [courseId],
  );
  const repeated = await db.query<{ id: string }>(
    "select public.start_instagram_material_document($1, 3::smallint, 'unused-slug') as id",
    [courseId],
  );
  assert.equal(repeated.rows[0]?.id, created.rows[0]?.id);

  const linked = await db.query<{ title: string; document_id: string }>(
    `select material.title, material.document_id
     from public.course_instagram_materials as material
     where material.course_id = $1 and material.position = 3`,
    [courseId],
  );
  assert.equal(linked.rows[0]?.title, "새 제목");
  assert.equal(linked.rows[0]?.document_id, created.rows[0]?.id);

  await db.close();
});
