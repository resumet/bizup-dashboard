import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";

const workspaceA = "00000000-0000-4000-8000-000000000001";
const workspaceB = "00000000-0000-4000-8000-000000000002";
const userA = "00000000-0000-4000-8000-000000000003";
const userB = "00000000-0000-4000-8000-000000000004";
const courseA = "00000000-0000-4000-8000-000000000005";

test("WBS 마이그레이션은 강의와 워크스페이스 연결 및 템플릿 업그레이드를 보장한다", async () => {
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
    await db.exec(await readFile("supabase/migrations/202609270001_course_wbs.sql", "utf8"));

    await assert.rejects(
      db.query("insert into public.course_wbs (course_id, workspace_id) values ($1, $2)", [courseA, workspaceB]),
      /foreign key constraint/,
    );
    await assert.rejects(
      db.query("insert into public.course_wbs (course_id, workspace_id, items) values ($1, $2, '{}'::jsonb)", [courseA, workspaceA]),
      /course_wbs_items_check/,
    );
    await db.query("insert into public.course_wbs (course_id, workspace_id, items, updated_by) values ($1, $2, $3::jsonb, $4)",
      [courseA, workspaceA, JSON.stringify([{ id: "task-1", title: "First" }]), userA]);
    const firstWbsRevision = (await db.query<{ revision: string }>(
      "select updated_at::text revision from public.course_wbs where course_id = $1", [courseA],
    )).rows[0].revision;
    const updatedWbs = await db.query(
      "update public.course_wbs set items = $1::jsonb where course_id = $2 and updated_at = $3::timestamptz returning course_id",
      [JSON.stringify([{ id: "task-1", title: "Updated" }]), courseA, firstWbsRevision],
    );
    assert.equal(updatedWbs.rows.length, 1);
    const staleWbs = await db.query(
      "update public.course_wbs set items = '[]'::jsonb where course_id = $1 and updated_at = $2::timestamptz returning course_id",
      [courseA, firstWbsRevision],
    );
    assert.equal(staleWbs.rows.length, 0);

    await db.query(`insert into public.course_wbs_templates (workspace_id, id, name, items, updated_by)
      values ($1, 'notion-webinar', 'Original', '[]'::jsonb, $3),
             ($2, 'notion-webinar', 'Other workspace', '[]'::jsonb, $4)`,
    [workspaceA, workspaceB, userA, userB]);
    await assert.rejects(
      db.query("insert into public.course_wbs_templates (workspace_id, id, name) values ($1, 'notion-webinar', 'Duplicate')", [workspaceA]),
      /duplicate key/,
    );
    const firstTemplateRevision = (await db.query<{ revision: string }>(
      "select updated_at::text revision from public.course_wbs_templates where workspace_id = $1 and id = 'notion-webinar'",
      [workspaceA],
    )).rows[0].revision;
    const upgradedTemplate = await db.query(
      `update public.course_wbs_templates set name = 'Upgraded', items = '[{"id":"task-2"}]'::jsonb
       where workspace_id = $1 and id = 'notion-webinar' and updated_at = $2::timestamptz returning id`,
      [workspaceA, firstTemplateRevision],
    );
    assert.equal(upgradedTemplate.rows.length, 1);
    const staleTemplate = await db.query(
      "update public.course_wbs_templates set name = 'Stale' where workspace_id = $1 and id = 'notion-webinar' and updated_at = $2::timestamptz returning id",
      [workspaceA, firstTemplateRevision],
    );
    assert.equal(staleTemplate.rows.length, 0);
    const names = await db.query<{ workspace_id: string; name: string }>(
      "select workspace_id, name from public.course_wbs_templates order by workspace_id",
    );
    assert.deepEqual(names.rows.map(({ name }) => name), ["Upgraded", "Other workspace"]);

    await db.exec("grant select, insert, update, delete on public.course_wbs to authenticated");
    await db.exec("grant select, insert, update, delete on public.course_wbs_templates to authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [userB]);
    await db.exec("set role authenticated");
    assert.equal((await db.query("select * from public.course_wbs")).rows.length, 0);
    assert.deepEqual((await db.query<{ name: string }>("select name from public.course_wbs_templates")).rows.map((row) => row.name), ["Other workspace"]);
  } finally {
    await db.close();
  }
});
