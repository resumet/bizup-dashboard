import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/202609290003_instagram_notion_snapshots.sql"),
  "utf8",
);

test("Notion 공개본과 공개 에셋 버킷을 안전한 제약조건으로 생성한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create schema storage;
    create table auth.users (id uuid primary key);
    create table public.courses (id uuid primary key, workspace_id uuid not null);
    create table public.course_instagram_materials (
      course_id uuid not null references public.courses(id) on delete cascade,
      position smallint not null,
      primary key (course_id, position)
    );
    create function public.is_workspace_member(target_workspace uuid)
    returns boolean language sql stable as 'select true';
    create table storage.buckets (
      id text primary key,
      name text not null,
      public boolean not null default false,
      file_size_limit bigint,
      allowed_mime_types text[]
    );
  `);
  await db.exec(migration);

  const courseId = "00000000-0000-0000-0000-000000000001";
  const userId = "00000000-0000-0000-0000-000000000002";
  await db.query("insert into auth.users (id) values ($1)", [userId]);
  await db.query("insert into public.courses (id, workspace_id) values ($1, $1)", [courseId]);
  await db.query("insert into public.course_instagram_materials (course_id, position) values ($1, 1)", [courseId]);
  await db.query(`
    insert into public.course_instagram_notion_snapshots
      (course_id, position, notion_page_id, source_url, content, synced_by)
    values ($1, 1, '0123456789abcdef0123456789abcdef', 'https://www.notion.so/example', '[]', $2)
  `, [courseId, userId]);

  const snapshots = await db.query<{ position: number; notion_page_id: string }>(
    "select position, notion_page_id from public.course_instagram_notion_snapshots",
  );
  assert.deepEqual(snapshots.rows, [{ position: 1, notion_page_id: "0123456789abcdef0123456789abcdef" }]);

  const buckets = await db.query<{ id: string; public: boolean; file_size_limit: number }>(
    "select id, public, file_size_limit::int from storage.buckets",
  );
  assert.deepEqual(buckets.rows, [{ id: "instagram-notion-assets", public: true, file_size_limit: 15_728_640 }]);

  await db.query("insert into public.course_instagram_materials (course_id, position) values ($1, 2)", [courseId]);
  await assert.rejects(
    db.query(`
      insert into public.course_instagram_notion_snapshots
        (course_id, position, notion_page_id, source_url, content)
      values ($1, 2, 'invalid', 'https://www.notion.so/example', '{}')
    `, [courseId]),
  );
  await db.close();
});
