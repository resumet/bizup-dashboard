import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261023072310_instagram_editing_upload_automation.sql"),
  "utf8",
);

test("편집 완료와 링크 기반 업로드 완료 및 웨비나 기준 일정을 자동 관리한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create table public.courses (
      id uuid primary key,
      workspace_id uuid not null,
      free_webinar_at timestamptz
    );
    create table public.course_document_settings (
      course_id uuid primary key references public.courses(id),
      workspace_id uuid not null,
      instagram_total_count smallint not null default 0
    );
    create table public.course_instagram_materials (
      course_id uuid not null references public.courses(id),
      position smallint not null,
      planning_completed boolean not null default false,
      filming_completed boolean not null default false,
      upload_date date,
      upload_completed boolean not null default false,
      uploaded_url text not null default '',
      dm_material text not null default '',
      updated_at timestamptz not null default now(),
      constraint course_instagram_materials_progress_order_check check (
        (not filming_completed or planning_completed)
        and (not upload_completed or filming_completed)
      ),
      primary key (course_id, position)
    );
  `);

  const courseId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";
  await db.query(
    "insert into public.courses (id, workspace_id, free_webinar_at) values ($1, $2, '2026-11-23T01:00:00Z')",
    [courseId, workspaceId],
  );
  await db.query(
    "insert into public.course_document_settings (course_id, workspace_id, instagram_total_count) values ($1, $2, 4)",
    [courseId, workspaceId],
  );
  await db.query(
    `insert into public.course_instagram_materials (course_id, position, planning_completed, filming_completed, upload_completed, uploaded_url, dm_material)
     values ($1, 1, true, true, true, 'https://instagram.com/p/one', 'https://example.com/dm'),
            ($1, 2, false, false, false, '', ''),
            ($1, 3, false, false, false, '', ''),
            ($1, 4, false, false, false, '', '')`,
    [courseId],
  );

  await db.exec(migration);

  const initial = await db.query<{
    position: number;
    editing_completed: boolean;
    upload_completed: boolean;
    upload_date: string;
  }>(
    "select position, editing_completed, upload_completed, upload_date::text from public.course_instagram_materials where course_id = $1 order by position",
    [courseId],
  );
  assert.deepEqual(initial.rows, [
    { position: 1, editing_completed: true, upload_completed: true, upload_date: "2026-11-18" },
    { position: 2, editing_completed: false, upload_completed: false, upload_date: "2026-11-19" },
    { position: 3, editing_completed: false, upload_completed: false, upload_date: "2026-11-20" },
    { position: 4, editing_completed: false, upload_completed: false, upload_date: "2026-11-23" },
  ]);

  await db.query(
    "update public.course_instagram_materials set uploaded_url = 'https://instagram.com/p/two', dm_material = 'https://example.com/two' where course_id = $1 and position = 2",
    [courseId],
  );
  const completed = await db.query<{
    planning_completed: boolean;
    filming_completed: boolean;
    editing_completed: boolean;
    upload_completed: boolean;
  }>(
    "select planning_completed, filming_completed, editing_completed, upload_completed from public.course_instagram_materials where course_id = $1 and position = 2",
    [courseId],
  );
  assert.deepEqual(completed.rows[0], {
    planning_completed: true,
    filming_completed: true,
    editing_completed: true,
    upload_completed: true,
  });

  await db.query(
    "update public.course_instagram_materials set dm_material = '' where course_id = $1 and position = 2",
    [courseId],
  );
  const cleared = await db.query<{ editing_completed: boolean; upload_completed: boolean }>(
    "select editing_completed, upload_completed from public.course_instagram_materials where course_id = $1 and position = 2",
    [courseId],
  );
  assert.deepEqual(cleared.rows[0], { editing_completed: true, upload_completed: false });

  await assert.rejects(db.query(
    "update public.course_instagram_materials set upload_completed = true where course_id = $1 and position = 3",
    [courseId],
  ));

  await db.close();
});
