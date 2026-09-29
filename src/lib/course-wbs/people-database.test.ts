import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceA = "00000000-0000-4000-8000-000000000011";
const workspaceB = "00000000-0000-4000-8000-000000000012";
const userA = "00000000-0000-4000-8000-000000000013";
const userB = "00000000-0000-4000-8000-000000000014";
const courseA = "00000000-0000-4000-8000-000000000015";

test("WBS people migration backfills exact choices and restricts them by workspace", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      create table public.workspaces (id uuid primary key);
      create table public.workspace_members (workspace_id uuid, user_id uuid);
      create function public.is_workspace_member(target_workspace uuid)
      returns boolean language sql stable security definer as
        $$ select exists(select 1 from public.workspace_members m
          where m.workspace_id = target_workspace and m.user_id = auth.uid()) $$;
      create table public.courses (id uuid primary key, workspace_id uuid not null);
    `);
    await db.query("insert into auth.users values ($1), ($2)", [userA, userB]);
    await db.query("insert into public.workspaces values ($1), ($2)", [workspaceA, workspaceB]);
    await db.query("insert into public.workspace_members values ($1, $2), ($3, $4)", [workspaceA, userA, workspaceB, userB]);
    await db.query("insert into public.courses values ($1, $2)", [courseA, workspaceA]);
    await db.exec(await readFile("supabase/migrations_archive/20260929/202609270001_course_wbs.sql", "utf8"));

    await db.query(
      "insert into public.course_wbs (course_id, workspace_id, items) values ($1, $2, $3::jsonb)",
      [courseA, workspaceA, JSON.stringify([
        { owner: " 김지은 ", stakeholders: "황지유, 김지은" },
        { owner: "황지유", stakeholders: " " },
      ])],
    );
    await db.query(
      "insert into public.course_wbs_templates (workspace_id, id, name, items) values ($1, 'template', 'Template', $2::jsonb), ($3, 'template', 'Other', $4::jsonb)",
      [workspaceA, JSON.stringify([{ owner: "김지은", stakeholders: "외부 업체 (A)" }]),
        workspaceB, JSON.stringify([{ owner: "다른 담당자" }])],
    );

    const migration = await readFile("supabase/migrations_archive/20260929/202609270002_course_wbs_people.sql", "utf8");
    await db.exec(migration);
    await db.exec(migration);

    const names = await db.query<{ workspace_id: string; name: string }>(
      "select workspace_id, name from public.course_wbs_people order by workspace_id, name",
    );
    assert.deepEqual(names.rows.filter((row) => row.workspace_id === workspaceA).map((row) => row.name),
      ["김지은", "외부 업체 (A)", "황지유", "황지유, 김지은"]);
    assert.deepEqual(names.rows.filter((row) => row.workspace_id === workspaceB).map((row) => row.name),
      ["다른 담당자"]);

    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
    await db.exec("set role authenticated");
    assert.deepEqual((await db.query<{ name: string }>("select name from public.course_wbs_people")).rows,
      [{ name: "다른 담당자" }]);
    await assert.rejects(db.query(
      "insert into public.course_wbs_people (workspace_id, name) values ($1, 'unauthorized')",
      [workspaceA],
    ), /row-level security policy/);
  } finally {
    await db.close();
  }
});
