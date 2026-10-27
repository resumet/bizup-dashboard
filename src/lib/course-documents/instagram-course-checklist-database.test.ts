import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const migration = readFileSync(
  path.join(process.cwd(), "supabase/migrations/20261027053351_instagram_course_checklist_template.sql"),
  "utf8",
);

test("공용 템플릿을 기본 7개 항목으로 갱신하고 강의별 완료 상태를 분리한다", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key);
    create table public.workspaces (id uuid primary key);
    create table public.courses (
      id uuid primary key,
      workspace_id uuid not null references public.workspaces(id) on delete cascade
    );
    create table public.instagram_management_checklists (
      workspace_id uuid primary key references public.workspaces(id) on delete cascade,
      items jsonb not null default '[{"id":"kim-suna-login","title":"김선아님 로그인 했는지","completed":false},{"id":"shin-yeyoung-blue-badge","title":"신예영님 블루뱃지 받았는지","completed":false},{"id":"shin-yeyoung-video","title":"신예영님 영상 올라온거 확인됐는지","completed":false},{"id":"shin-yeyoung-filming-date","title":"신예영님 촬영 일자 확정했는지","completed":false}]'::jsonb,
      updated_by uuid references auth.users(id) on delete set null,
      updated_at timestamptz not null default now(),
      constraint instagram_management_checklists_items_array_check check (jsonb_typeof(items) = 'array')
    );
  `);

  const workspaceId = "00000000-0000-4000-8000-000000000001";
  const customWorkspaceId = "00000000-0000-4000-8000-000000000002";
  const newWorkspaceId = "00000000-0000-4000-8000-000000000003";
  const courseId = "00000000-0000-4000-8000-000000000004";
  await db.query("insert into public.workspaces (id) values ($1), ($2), ($3)", [workspaceId, customWorkspaceId, newWorkspaceId]);
  await db.query("insert into public.instagram_management_checklists (workspace_id) values ($1)", [workspaceId]);
  await db.query(
    "insert into public.instagram_management_checklists (workspace_id, items) values ($1, $2::jsonb)",
    [customWorkspaceId, JSON.stringify([{ id: "custom", title: "맞춤 항목", completed: true }])],
  );

  await db.exec(migration);

  const migrated = await db.query<{ items: Array<{ id: string; title: string; completed?: boolean }> }>(
    "select items from public.instagram_management_checklists where workspace_id = $1",
    [workspaceId],
  );
  assert.equal(migrated.rows[0]?.items.length, 7);
  assert.equal(migrated.rows[0]?.items[0]?.title, "계정 로그인 완료했는지");
  assert.equal("completed" in (migrated.rows[0]?.items[0] ?? {}), false);

  const custom = await db.query<{ items: Array<{ id: string; title: string; completed?: boolean }> }>(
    "select items from public.instagram_management_checklists where workspace_id = $1",
    [customWorkspaceId],
  );
  assert.deepEqual(custom.rows[0]?.items, [{ id: "custom", title: "맞춤 항목" }]);

  await db.query("insert into public.instagram_management_checklists (workspace_id) values ($1)", [newWorkspaceId]);
  const defaults = await db.query<{ count: number }>(
    "select jsonb_array_length(items)::integer as count from public.instagram_management_checklists where workspace_id = $1",
    [newWorkspaceId],
  );
  assert.equal(defaults.rows[0]?.count, 7);

  await db.query("insert into public.courses (id, workspace_id) values ($1, $2)", [courseId, workspaceId]);
  await db.query(
    "insert into public.course_instagram_checklist_states (course_id, completed_item_ids) values ($1, $2::jsonb)",
    [courseId, JSON.stringify(["account-login", "filming-date-1"])],
  );
  const state = await db.query<{ completed_item_ids: string[] }>(
    "select completed_item_ids from public.course_instagram_checklist_states where course_id = $1",
    [courseId],
  );
  assert.deepEqual(state.rows[0]?.completed_item_ids, ["account-login", "filming-date-1"]);

  await db.close();
});
