import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027033438_instagram_checklist_and_material_automation.sql"),
  "utf8",
);

test("인스타 할 일 기본값과 제목·촬영일정·DM 없음 자동화를 적용한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.course_instagram_materials (
      course_id uuid not null,
      position smallint not null,
      title text not null default '',
      planning_completed boolean not null default false,
      filming_date date,
      filming_completed boolean not null default false,
      editing_completed boolean not null default false,
      upload_completed boolean not null default false,
      uploaded_url text not null default '',
      dm_material text not null default '',
      updated_at timestamptz not null default now(),
      constraint course_instagram_materials_progress_order_check check (
        (not filming_completed or planning_completed)
        and (not upload_completed or filming_completed)
        and (not upload_completed or editing_completed)
      ),
      constraint course_instagram_materials_upload_completion_check check (
        upload_completed = (
          nullif(btrim(uploaded_url), '') is not null
          and nullif(btrim(dm_material), '') is not null
        )
      ),
      primary key (course_id, position)
    );
  `);

  await db.exec(migration);

  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const courseId = "00000000-0000-4000-8000-000000000002";
  await db.query("insert into public.workspaces (id) values ($1)", [workspaceId]);
  await db.query("insert into public.instagram_management_checklists (workspace_id) values ($1)", [workspaceId]);
  const checklist = await db.query<{ items: Array<{ title: string; completed: boolean }> }>(
    "select items from public.instagram_management_checklists where workspace_id = $1",
    [workspaceId],
  );
  assert.equal(checklist.rows[0]?.items.length, 4);
  assert.equal(checklist.rows[0]?.items[0]?.title, "김선아님 로그인 했는지");
  assert.equal(checklist.rows[0]?.items[0]?.completed, false);

  await db.query(
    `insert into public.course_instagram_materials
      (course_id, position, title, filming_date, uploaded_url, dm_not_required)
     values ($1, 1, '자동 기획', '2026-11-10', 'https://instagram.com/p/one', true)`,
    [courseId],
  );
  const automated = await db.query<{
    planning_completed: boolean;
    filming_completed: boolean;
    editing_completed: boolean;
    upload_completed: boolean;
  }>(
    `select planning_completed, filming_completed, editing_completed, upload_completed
     from public.course_instagram_materials where course_id = $1 and position = 1`,
    [courseId],
  );
  assert.deepEqual(automated.rows[0], {
    planning_completed: true,
    filming_completed: true,
    editing_completed: true,
    upload_completed: true,
  });

  await db.query(
    "update public.course_instagram_materials set dm_not_required = false where course_id = $1 and position = 1",
    [courseId],
  );
  const incomplete = await db.query<{ upload_completed: boolean }>(
    "select upload_completed from public.course_instagram_materials where course_id = $1 and position = 1",
    [courseId],
  );
  assert.equal(incomplete.rows[0]?.upload_completed, false);

  await db.close();
});
