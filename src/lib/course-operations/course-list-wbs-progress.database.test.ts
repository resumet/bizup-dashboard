import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { PGlite } from "@electric-sql/pglite";

const workspaceA = "00000000-0000-4000-8000-000000000001";
const workspaceB = "00000000-0000-4000-8000-000000000002";
const courseA = "00000000-0000-4000-8000-000000000003";
const courseB = "00000000-0000-4000-8000-000000000004";

test("강의 운영 목록용 WBS 집계는 워크스페이스와 미완료 기한을 지킨다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role;
      create table public.course_wbs (
        course_id uuid primary key,
        workspace_id uuid not null,
        items jsonb not null default '[]'::jsonb
      );
    `);
    await db.exec(await readFile(
      "supabase/migrations/20261027010334_course_operations_list_wbs_progress.sql",
      "utf8",
    ));
    await db.query(
      "insert into public.course_wbs(course_id, workspace_id, items) values ($1, $2, $3::jsonb), ($4, $5, $6::jsonb)",
      [
        courseA,
        workspaceA,
        JSON.stringify([
          { id: "overdue-due", dueDate: "2026-10-26", completed: false },
          { id: "overdue-start", startDate: "2026-10-20", dueDate: "", completed: false },
          { id: "today", dueDate: "2026-10-27", completed: false },
          { id: "completed", dueDate: "2026-10-01", completed: true },
        ]),
        courseB,
        workspaceB,
        JSON.stringify([{ id: "other-workspace", dueDate: "2026-01-01", completed: false }]),
      ],
    );

    const rows = await db.query<{
      course_id: string;
      total_item_count: number;
      overdue_item_count: number;
    }>(
      "select * from public.course_operations_list_wbs_progress($1, $2::date)",
      [workspaceA, "2026-10-27"],
    );
    assert.deepEqual(rows.rows, [{
      course_id: courseA,
      total_item_count: 4,
      overdue_item_count: 2,
    }]);
    const privileges = await db.query<{
      authenticated: boolean;
      service_role: boolean;
    }>(`
      select
        has_function_privilege('authenticated', 'public.course_operations_list_wbs_progress(uuid,date)', 'execute') as authenticated,
        has_function_privilege('service_role', 'public.course_operations_list_wbs_progress(uuid,date)', 'execute') as service_role
    `);
    assert.deepEqual(privileges.rows[0], {
      authenticated: false,
      service_role: true,
    });
  } finally {
    await db.close();
  }
});
