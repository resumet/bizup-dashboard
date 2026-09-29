import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceA = "00000000-0000-4000-8000-000000000001";
const workspaceB = "00000000-0000-4000-8000-000000000002";
const userA = "00000000-0000-4000-8000-000000000003";
const userB = "00000000-0000-4000-8000-000000000004";

test("날짜별 업무보고는 사용자마다 한 건을 저장하고 워크스페이스 밖에서는 읽을 수 없다", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create role service_role;
      create schema auth;
      create table auth.users (id uuid primary key);
      create table public.workspaces (id uuid primary key);
      create table public.workspace_members (workspace_id uuid, user_id uuid);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create function public.is_workspace_member(target_workspace uuid)
      returns boolean language sql stable security definer as
        $$ select exists(select 1 from public.workspace_members m
          where m.workspace_id = target_workspace and m.user_id = auth.uid()) $$;
      create function public.personnel_is_active(target_workspace uuid)
      returns boolean language sql stable security definer as
        $$ select public.is_workspace_member(target_workspace) $$;
      insert into auth.users values ('${userA}'), ('${userB}');
      insert into public.workspaces values ('${workspaceA}'), ('${workspaceB}');
      insert into public.workspace_members values ('${workspaceA}', '${userA}'), ('${workspaceB}', '${userB}');
    `);
    const migration = await readFile("supabase/migrations_archive/20260929/202609280003_work_daily_reports.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);

    await db.query(
      `insert into public.work_daily_reports(workspace_id,user_id,work_date,content)
       values($1,$2,'2026-09-28','첫 보고')
       on conflict(workspace_id,user_id,work_date) do update set content=excluded.content`,
      [workspaceA, userA],
    );
    await db.query(
      `insert into public.work_daily_reports(workspace_id,user_id,work_date,content)
       values($1,$2,'2026-09-28','수정 보고')
       on conflict(workspace_id,user_id,work_date) do update set content=excluded.content`,
      [workspaceA, userA],
    );
    assert.deepEqual(
      (await db.query<{ content: string }>("select content from public.work_daily_reports")).rows,
      [{ content: "수정 보고" }],
    );
    await assert.rejects(
      db.query("update public.work_daily_reports set content=$1", ["a".repeat(10001)]),
      /work_daily_reports_content_check/,
    );

    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${userB}',false)`);
    assert.equal((await db.query("select * from public.work_daily_reports")).rows.length, 0);
  } finally {
    await db.close();
  }
});
