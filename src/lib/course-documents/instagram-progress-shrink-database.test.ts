import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261023073339_shrink_instagram_progress_from_nearest_empty.sql"),
  "utf8",
);

test("전체 건수 축소 시 웨비나에 가까운 빈 항목부터 삭제하고 입력된 항목은 보존한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;

    create table public.courses (
      id uuid primary key,
      workspace_id uuid not null
    );

    create table public.course_document_settings (
      course_id uuid primary key references public.courses(id),
      workspace_id uuid not null,
      instagram_account_url text not null default '',
      instagram_total_count smallint not null default 0,
      updated_at timestamptz not null default now()
    );

    create table public.course_instagram_materials (
      course_id uuid not null references public.courses(id),
      position smallint not null,
      title text not null default '',
      reference_planning_number text not null default '',
      notion_url text not null default '',
      document_id uuid,
      planning_completed boolean not null default false,
      filming_date date,
      filming_completed boolean not null default false,
      editing_completed boolean not null default false,
      upload_date date,
      upload_completed boolean not null default false,
      uploaded_url text not null default '',
      dm_material text not null default '',
      updated_at timestamptz not null default now(),
      primary key (course_id, position)
    );

    create table public.course_instagram_notion_snapshots (
      course_id uuid not null,
      position smallint not null,
      notion_page_id text not null,
      primary key (course_id, position),
      constraint course_instagram_notion_snapshots_material_fkey
        foreign key (course_id, position)
        references public.course_instagram_materials(course_id, position)
        on delete cascade,
      constraint course_instagram_notion_snapshots_position_check
        check (position between 1 and 40)
    );
  `);

  const courseId = "00000000-0000-4000-8000-000000000001";
  const workspaceId = "00000000-0000-4000-8000-000000000002";

  await db.query("insert into public.courses (id, workspace_id) values ($1, $2)", [courseId, workspaceId]);
  await db.query(
    "insert into public.course_document_settings (course_id, workspace_id, instagram_total_count) values ($1, $2, 40)",
    [courseId, workspaceId],
  );
  await db.query(
    `insert into public.course_instagram_materials (course_id, position, upload_date)
     select $1, position::smallint, date '2026-10-23' + position
     from generate_series(1, 40) as generated(position)`,
    [courseId],
  );
  await db.query(
    "update public.course_instagram_materials set title = '보존할 콘텐츠' where course_id = $1 and position = 40",
    [courseId],
  );
  await db.query(
    "insert into public.course_instagram_notion_snapshots (course_id, position, notion_page_id) values ($1, 35, 'saved-page')",
    [courseId],
  );

  await db.exec(migration);
  await db.query(
    "select public.resize_instagram_progress($1, $2, '', 20::smallint, 0::smallint, 0::smallint)",
    [courseId, workspaceId],
  );

  const materials = await db.query<{ position: number; title: string }>(
    "select position, title from public.course_instagram_materials where course_id = $1 order by position",
    [courseId],
  );
  assert.equal(materials.rows.length, 20);
  assert.deepEqual(materials.rows.map(({ position }) => position), Array.from({ length: 20 }, (_, index) => index + 1));
  assert.deepEqual(materials.rows.filter(({ title }) => title !== ""), [
    { position: 20, title: "보존할 콘텐츠" },
  ]);

  const snapshots = await db.query<{ position: number }>(
    "select position from public.course_instagram_notion_snapshots where course_id = $1",
    [courseId],
  );
  assert.deepEqual(snapshots.rows, [{ position: 19 }]);

  const settings = await db.query<{ instagram_total_count: number }>(
    "select instagram_total_count from public.course_document_settings where course_id = $1",
    [courseId],
  );
  assert.equal(settings.rows[0]?.instagram_total_count, 20);

  await db.query(
    "update public.course_instagram_materials set title = '입력됨 ' || position where course_id = $1",
    [courseId],
  );
  await assert.rejects(
    db.query(
      "select public.resize_instagram_progress($1, $2, '', 19::smallint, 0::smallint, 0::smallint)",
      [courseId, workspaceId],
    ),
    /INSTAGRAM_TOTAL_COUNT_HAS_DATA/,
  );

  await db.close();
});
